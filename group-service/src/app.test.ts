import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { GroupStore, type Group } from "./group-store.js";

const secret = "test-only-secret";
let directory: string;
let server: Server;
let baseUrl: string;
let token: string;
let store: GroupStore;

const validBody = {
  subject: "Calculus",
  topic: "Limits",
  datetime: "2026-11-01T10:00:00+07:00",
  maxMembers: 5,
  location: "Library 3F",
};

function authJson(t: string): Record<string, string> {
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "study-buddy-group-"));
  store = await GroupStore.open(join(directory, "groups.json"));
  server = createApp(store, secret).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = jwt.sign({ userId: "user-1" }, secret, { algorithm: "HS256", expiresIn: "5m" });
});

afterEach(async () => {
  server.close();
  await new Promise<void>((resolve) => server.once("close", resolve));
  await rm(directory, { recursive: true, force: true });
});

test("GET /health returns ok without token", async () => {
  const r = await fetch(`${baseUrl}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: "ok", service: "group" });
});

test("API without token returns 401 {error,message}", async () => {
  const r = await fetch(`${baseUrl}/api/groups`);
  assert.equal(r.status, 401);
  assert.deepEqual(Object.keys(await r.json()).sort(), ["error", "message"]);
});

test("POST creates group with valid input and sets owner from token", async () => {
  const r = await fetch(`${baseUrl}/api/groups`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "Calculus", topic: "Limits", datetime: "2026-11-01T10:00:00+07:00", maxMembers: 5, location: "Library 3F" }) });
  assert.equal(r.status, 201);
  const g = await r.json() as Group;
  assert.equal(g.ownerId, "user-1"); assert.deepEqual(g.members, ["user-1"]);
});

test("POST rejects missing subject/datetime and non-positive maxMembers with 400", async () => {
  for (const body of [{ topic: "x" }, { subject: "Cal", topic: "t", datetime: "not-a-date", maxMembers: 5, location: "l" }, { subject: "Cal", topic: "t", datetime: "2026-11-01T10:00:00+07:00", maxMembers: 0, location: "l" }, { subject: "Cal", topic: "t", datetime: "2026-11-01T10:00:00+07:00", maxMembers: 2.5, location: "l" }]) {
    const r = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(r.status, 400);
  }
});

test("GET search filters by subject case-insensitively and openOnly hides full/closed groups", async () => {
  async function create(body: unknown): Promise<Group> {
    const r = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify(body) });
    assert.equal(r.status, 201);
    return (await r.json()) as Group;
  }
  await create({ ...validBody, subject: "Calculus", datetime: "2026-11-03T10:00:00+07:00", maxMembers: 5 });
  await create({ ...validBody, subject: "Calculus", datetime: "2026-11-02T10:00:00+07:00", maxMembers: 1 });
  await create({ ...validBody, subject: "Calculus", datetime: "2026-11-04T10:00:00+07:00", maxMembers: 5, isOpen: false });
  await create({ ...validBody, subject: "Physics", datetime: "2026-11-01T10:00:00+07:00", maxMembers: 5 });

  const open = await (await fetch(`${baseUrl}/api/groups?subject=${encodeURIComponent("  CALCULUS ")}&openOnly=true`, { headers: { Authorization: `Bearer ${token}` } })).json() as Group[];
  assert.equal(open.length, 1);
  assert.ok(open.every((g) => g.subject.toLocaleLowerCase() === "calculus" && g.members.length < g.maxMembers && g.isOpen));

  const all = await (await fetch(`${baseUrl}/api/groups`, { headers: { Authorization: `Bearer ${token}` } })).json() as Group[];
  assert.equal(all.length, 4);
  const times = all.map((g) => Date.parse(g.datetime));
  assert.deepEqual([...times].sort((a, b) => a - b), times);
});

test("GET by id returns group, 404 for missing", async () => {
  const created = await (await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify(validBody) })).json() as Group;
  const found = await fetch(`${baseUrl}/api/groups/${created.id}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(found.status, 200);
  assert.equal(((await found.json()) as Group).id, created.id);
  const missing = await fetch(`${baseUrl}/api/groups/no-such-id`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { error: string }).error, "not_found");
});

test("PATCH by owner updates topic/location, non-owner gets 403", async () => {
  const created = await (await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify(validBody) })).json() as Group;
  const ok = await fetch(`${baseUrl}/api/groups/${created.id}`, { method: "PATCH", headers: authJson(token), body: JSON.stringify({ topic: "Derivatives", location: "Room 204" }) });
  assert.equal(ok.status, 200);
  const updated = await ok.json() as Group;
  assert.equal(updated.topic, "Derivatives");
  assert.equal(updated.location, "Room 204");
  assert.equal(updated.ownerId, "user-1");
  assert.deepEqual(updated.members, ["user-1"]);
  const other = jwt.sign({ userId: "user-2" }, secret, { algorithm: "HS256" });
  const denied = await fetch(`${baseUrl}/api/groups/${created.id}`, { method: "PATCH", headers: authJson(other), body: JSON.stringify({ topic: "hack" }) });
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { error: string }).error, "forbidden");
});

test("PATCH rejects shrinking maxMembers below current members and bad datetime", async () => {
  const created = await (await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify({ ...validBody, maxMembers: 3 }) })).json() as Group;
  // Seed 3 members via the store directly (no forward dep on Task 5 endpoint).
  await store.update(created.id, { members: ["user-1", "user-2", "user-3"] });
  const shrink = await fetch(`${baseUrl}/api/groups/${created.id}`, { method: "PATCH", headers: authJson(token), body: JSON.stringify({ maxMembers: 2 }) });
  assert.equal(shrink.status, 400);
  assert.equal(((await shrink.json()) as { error: string }).error, "validation_error");
  const badDate = await fetch(`${baseUrl}/api/groups/${created.id}`, { method: "PATCH", headers: authJson(token), body: JSON.stringify({ datetime: "tomorrow" }) });
  assert.equal(badDate.status, 400);
  assert.equal(((await badDate.json()) as { error: string }).error, "validation_error");
});

async function createGroup(authToken: string, body: unknown): Promise<Group> {
  const r = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(authToken), body: JSON.stringify(body) });
  assert.equal(r.status, 201);
  return (await r.json()) as Group;
}

async function postMember(groupId: string, userId: unknown, authToken: string): Promise<Response> {
  return fetch(`${baseUrl}/api/groups/${groupId}/members`, { method: "POST", headers: authJson(authToken), body: JSON.stringify({ userId }) });
}

test("owner can add member once, duplicate is 409, full group is 422", async () => {
  const g = await createGroup(token, { ...validBody, maxMembers: 2 });
  const first = await postMember(g.id, "user-2", token);
  assert.equal(first.status, 200);
  const added = (await first.json()) as Group;
  assert.ok(added.members.includes("user-2"));
  const dup = await postMember(g.id, "user-2", token);
  assert.equal(dup.status, 409);
  assert.equal(((await dup.json()) as { error: string }).error, "conflict");
  // Group is now full (2/2); next distinct user must be rejected.
  const full = await postMember(g.id, "user-3", token);
  assert.equal(full.status, 422);
  assert.equal(((await full.json()) as { error: string }).error, "capacity_exceeded");
});

test("non-owner cannot add members (403)", async () => {
  const g = await createGroup(token, validBody);
  const other = jwt.sign({ userId: "user-2" }, secret, { algorithm: "HS256" });
  const denied = await postMember(g.id, "user-2", other);
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { error: string }).error, "forbidden");
});
