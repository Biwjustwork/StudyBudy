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

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "study-buddy-group-"));
  const store = await GroupStore.open(join(directory, "groups.json"));
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
