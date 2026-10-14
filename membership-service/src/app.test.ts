import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { type GroupClient, type GroupSnapshot, GroupServiceError, HttpGroupClient } from "./group-client.js";
import { RequestStore, type MembershipRequest } from "./request-store.js";

const secret = "membership-test-secret";
let directory: string;
let server: Server;
let baseUrl: string;
let store: RequestStore;
let groups: FakeGroupClient;
const ownerToken = jwt.sign({ userId: "owner-1" }, secret, { algorithm: "HS256", expiresIn: "5m" });
const requesterToken = jwt.sign({ userId: "student-1" }, secret, { algorithm: "HS256", expiresIn: "5m" });
const otherToken = jwt.sign({ userId: "student-2" }, secret, { algorithm: "HS256", expiresIn: "5m" });

class FakeGroupClient implements GroupClient {
  group: GroupSnapshot = {
    id: "group-1",
    ownerId: "owner-1",
    members: ["owner-1"],
    maxMembers: 3,
    isOpen: true,
  };
  addMemberError: GroupServiceError | undefined;
  addMemberCalls = 0;

  async getGroup(groupId: string): Promise<GroupSnapshot> {
    if (groupId !== this.group.id) throw new GroupServiceError(404, "Group not found");
    return structuredClone(this.group);
  }

  async addMember(_groupId: string, userId: string): Promise<void> {
    this.addMemberCalls += 1;
    if (this.addMemberError) throw this.addMemberError;
    if (!this.group.isOpen || this.group.members.length >= this.group.maxMembers) {
      throw new GroupServiceError(422, "Group is full or closed for new members");
    }
    if (this.group.members.includes(userId)) throw new GroupServiceError(409, "User is already a member");
    this.group.members.push(userId);
  }
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function createRequest(token = requesterToken): Promise<MembershipRequest> {
  const response = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ groupId: "group-1" }),
  });
  assert.equal(response.status, 201);
  return await response.json() as MembershipRequest;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "study-buddy-membership-"));
  store = await RequestStore.open(join(directory, "requests.json"));
  groups = new FakeGroupClient();
  server = createApp(store, secret, groups).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.close();
  await new Promise<void>((resolve) => server.once("close", resolve));
  await rm(directory, { recursive: true, force: true });
});

test("health is public and API requires a valid bearer token", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", service: "membership" });

  const missing = await fetch(`${baseUrl}/api/requests?groupId=group-1`);
  assert.equal(missing.status, 401);
  const invalid = await fetch(`${baseUrl}/api/requests?groupId=group-1`, { headers: headers("invalid") });
  assert.equal(invalid.status, 401);
});

test("request creation validates group, rejects full groups and prevents duplicates", async () => {
  const first = await createRequest();
  assert.equal(first.status, "pending");
  assert.equal(first.requesterId, "student-1");

  const duplicate = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: headers(requesterToken),
    body: JSON.stringify({ groupId: "group-1" }),
  });
  assert.equal(duplicate.status, 409);

  groups.group.members = ["owner-1", "member-2", "member-3"];
  const full = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: headers(otherToken),
    body: JSON.stringify({ groupId: "group-1" }),
  });
  assert.equal(full.status, 422);

  const missing = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: headers(otherToken),
    body: JSON.stringify({ groupId: "missing" }),
  });
  assert.equal(missing.status, 404);
});

test("request body and owner-list groupId are required", async () => {
  const empty = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: headers(requesterToken),
    body: JSON.stringify({ groupId: " " }),
  });
  assert.equal(empty.status, 400);
  const noGroup = await fetch(`${baseUrl}/api/requests`, { headers: headers(ownerToken) });
  assert.equal(noGroup.status, 400);
});

test("only the group owner can view requests", async () => {
  const created = await createRequest();
  const ownerView = await fetch(`${baseUrl}/api/requests?groupId=group-1`, { headers: headers(ownerToken) });
  assert.equal(ownerView.status, 200);
  assert.deepEqual((await ownerView.json() as MembershipRequest[]).map((item) => item.id), [created.id]);

  const denied = await fetch(`${baseUrl}/api/requests?groupId=group-1`, { headers: headers(otherToken) });
  assert.equal(denied.status, 403);
});

test("approval atomically adds one member, then records approved; repeat is rejected", async () => {
  const created = await createRequest();
  const url = `${baseUrl}/api/requests/${created.id}/approve`;
  const approved = await fetch(url, { method: "POST", headers: headers(ownerToken) });
  assert.equal(approved.status, 200);
  const result = await approved.json() as MembershipRequest;
  assert.equal(result.status, "approved");
  assert.equal(result.decidedBy, "owner-1");
  assert.equal(result.notificationStatus, "pending");
  assert.deepEqual(groups.group.members, ["owner-1", "student-1"]);
  assert.equal(groups.addMemberCalls, 1);

  const repeated = await fetch(url, { method: "POST", headers: headers(ownerToken) });
  assert.equal(repeated.status, 409);
  assert.equal(groups.addMemberCalls, 1);
});

test("non-owner cannot decide and Group Service failure leaves request pending for retry", async () => {
  const created = await createRequest();
  const url = `${baseUrl}/api/requests/${created.id}/approve`;
  const denied = await fetch(url, { method: "POST", headers: headers(otherToken) });
  assert.equal(denied.status, 403);

  groups.addMemberError = new GroupServiceError(422, "Group is full or closed for new members");
  const full = await fetch(url, { method: "POST", headers: headers(ownerToken) });
  assert.equal(full.status, 422);
  assert.equal(store.get(created.id)?.status, "pending");

  groups.addMemberError = undefined;
  groups.group.maxMembers = 5;
  const retry = await fetch(url, { method: "POST", headers: headers(ownerToken) });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json() as MembershipRequest).status, "approved");
});

test("reject changes status once without reserving a group seat", async () => {
  const created = await createRequest();
  const url = `${baseUrl}/api/requests/${created.id}/reject`;
  const rejected = await fetch(url, { method: "POST", headers: headers(ownerToken) });
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json() as MembershipRequest).status, "rejected");
  assert.equal(groups.addMemberCalls, 0);

  const repeated = await fetch(url, { method: "POST", headers: headers(ownerToken) });
  assert.equal(repeated.status, 409);
});

test("concurrent approvals reserve a seat only once", async () => {
  const created = await createRequest();
  const url = `${baseUrl}/api/requests/${created.id}/approve`;
  const results = await Promise.all([
    fetch(url, { method: "POST", headers: headers(ownerToken) }),
    fetch(url, { method: "POST", headers: headers(ownerToken) }),
  ]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  assert.equal(groups.addMemberCalls, 1);
  assert.equal(groups.group.members.filter((id) => id === "student-1").length, 1);
});

test("closed groups cannot receive requests", async () => {
  groups.group.isOpen = false;
  const response = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: headers(requesterToken),
    body: JSON.stringify({ groupId: "group-1" }),
  });
  assert.equal(response.status, 422);
});

test("HTTP Group client uses the delivered routes and forwards owner authorization", async () => {
  const calls: Array<{ method: string; url: string; authorization: string | undefined; body: string }> = [];
  const groupServer = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    calls.push({
      method: request.method ?? "",
      url: request.url ?? "",
      authorization: request.headers.authorization,
      body,
    });
    response.setHeader("Content-Type", "application/json");
    if (request.method === "POST" && body.includes('"userId":"full"')) {
      response.writeHead(422).end(JSON.stringify({ error: "capacity_exceeded", message: "Group is full" }));
      return;
    }
    response.end(JSON.stringify(groups.group));
  });
  groupServer.listen(0);
  await new Promise<void>((resolve) => groupServer.once("listening", resolve));
  const address = groupServer.address() as AddressInfo;
  const client = new HttpGroupClient(`http://127.0.0.1:${address.port}`);
  try {
    const group = await client.getGroup("group-1", "owner-token");
    assert.equal(group.id, "group-1");
    await client.addMember("group-1", "student-1", "owner-token");
    await assert.rejects(
      client.addMember("group-1", "full", "owner-token"),
      (error: unknown) => error instanceof GroupServiceError && error.status === 422,
    );
    assert.deepEqual(calls.map((call) => [call.method, call.url, call.authorization]), [
      ["GET", "/api/groups/group-1", "Bearer owner-token"],
      ["POST", "/api/groups/group-1/members", "Bearer owner-token"],
      ["POST", "/api/groups/group-1/members", "Bearer owner-token"],
    ]);
    assert.equal(calls[1]?.body, '{"userId":"student-1"}');
  } finally {
    groupServer.close();
    await new Promise<void>((resolve) => groupServer.once("close", resolve));
  }
});
