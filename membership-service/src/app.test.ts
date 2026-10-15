import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { type GroupClient, type GroupSnapshot, GroupServiceError, HttpGroupClient } from "./group-client.js";
import { retryPendingNotifications } from "./notification-delivery.js";
import { type NotificationClient, type NotificationEvent, NotificationServiceError, HttpNotificationClient } from "./notification-client.js";
import { RequestStore, type MembershipRequest } from "./request-store.js";

const secret = "membership-test-secret-with-more-than-32-characters";
const serviceToken = "test-group-service-token";
let directory: string;
let server: Server;
let baseUrl: string;
let store: RequestStore;
let groups: FakeGroupClient;
let notifications: FakeNotificationClient;
const ownerToken = jwt.sign({ userId: "owner-1" }, secret, { algorithm: "HS256", expiresIn: "5m" });
const requesterToken = jwt.sign({ userId: "student-1" }, secret, { algorithm: "HS256", expiresIn: "5m" });
const otherToken = jwt.sign({ userId: "student-2" }, secret, { algorithm: "HS256", expiresIn: "5m" });
const tokenWithoutExpiry = jwt.sign({ userId: "student-3" }, secret, { algorithm: "HS256" });

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

class FakeNotificationClient implements NotificationClient {
  error: NotificationServiceError | undefined;
  events: NotificationEvent[] = [];

  async send(event: NotificationEvent): Promise<void> {
    this.events.push(structuredClone(event));
    if (this.error) throw this.error;
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
  notifications = new FakeNotificationClient();
  server = createApp(store, secret, groups, notifications).listen(0);
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
  const missingExpiry = await fetch(`${baseUrl}/api/requests?groupId=group-1`, {
    headers: headers(tokenWithoutExpiry),
  });
  assert.equal(missingExpiry.status, 401);
  const expired = jwt.sign({ userId: "student-3" }, secret, { algorithm: "HS256", expiresIn: -1 });
  const expiredResponse = await fetch(`${baseUrl}/api/requests?groupId=group-1`, { headers: headers(expired) });
  assert.equal(expiredResponse.status, 401);
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
  assert.equal(store.get(created.id)?.approvalState, "reserved");
  assert.equal(result.notificationStatus, "sent");
  assert.deepEqual(groups.group.members, ["owner-1", "student-1"]);
  assert.equal(groups.addMemberCalls, 1);
  assert.deepEqual(notifications.events, [{
    userId: "student-1",
    type: "request_approved",
    message: "คำขอเข้ากลุ่มได้รับอนุมัติ",
    relatedId: created.id,
  }]);

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
  const result = await rejected.json() as MembershipRequest;
  assert.equal(result.status, "rejected");
  assert.equal(result.notificationStatus, "sent");
  assert.equal(groups.addMemberCalls, 0);
  assert.equal(notifications.events[0]?.type, "request_rejected");

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

test("failed membership status persistence recovers without adding the member twice", async () => {
  const dataFile = join(directory, "recoverable-requests.json");
  let failApprovalCommit = true;
  const failingStore = await RequestStore.open(dataFile, async (filePath, records) => {
    if (failApprovalCommit && records.some((item) => item.status === "approved")) {
      throw new Error("simulated membership status write failure");
    }
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(records), "utf8");
  });
  const created = await failingStore.create("group-1", "student-1");
  assert.ok(created);

  const firstServer = createApp(failingStore, secret, groups, notifications).listen(0);
  await new Promise<void>((resolve) => firstServer.once("listening", resolve));
  const firstAddress = firstServer.address() as AddressInfo;
  const firstResponse = await fetch(`http://127.0.0.1:${firstAddress.port}/api/requests/${created.id}/approve`, {
    method: "POST",
    headers: headers(ownerToken),
  });
  assert.equal(firstResponse.status, 500);
  assert.deepEqual(groups.group.members, ["owner-1", "student-1"]);
  assert.equal(groups.addMemberCalls, 1);
  assert.equal(failingStore.get(created.id)?.status, "pending");
  assert.equal(failingStore.get(created.id)?.approvalState, "reserved");
  const prematureReject = await fetch(`http://127.0.0.1:${firstAddress.port}/api/requests/${created.id}/reject`, {
    method: "POST",
    headers: headers(ownerToken),
  });
  assert.equal(prematureReject.status, 409);
  firstServer.close();
  await new Promise<void>((resolve) => firstServer.once("close", resolve));

  failApprovalCommit = false;
  const recoveredStore = await RequestStore.open(dataFile);
  const retryServer = createApp(recoveredStore, secret, groups, notifications).listen(0);
  await new Promise<void>((resolve) => retryServer.once("listening", resolve));
  const retryAddress = retryServer.address() as AddressInfo;
  const retryResponse = await fetch(`http://127.0.0.1:${retryAddress.port}/api/requests/${created.id}/approve`, {
    method: "POST",
    headers: headers(ownerToken),
  });
  assert.equal(retryResponse.status, 200);
  assert.equal((await retryResponse.json() as MembershipRequest).status, "approved");
  assert.equal(groups.addMemberCalls, 1);
  retryServer.close();
  await new Promise<void>((resolve) => retryServer.once("close", resolve));
});

test("Notification failure is recorded and retry reuses the idempotent event", async () => {
  const created = await createRequest();
  notifications.error = new NotificationServiceError(503, "Notification Service is unavailable");
  const response = await fetch(`${baseUrl}/api/requests/${created.id}/reject`, {
    method: "POST",
    headers: headers(ownerToken),
  });
  assert.equal(response.status, 200);
  const pending = await response.json() as MembershipRequest;
  assert.equal(pending.status, "rejected");
  assert.equal(pending.notificationStatus, "pending");
  assert.equal(pending.notificationLastError, "Notification Service is unavailable");
  assert.equal(store.pendingNotifications().length, 1);

  notifications.error = undefined;
  const reopenedStore = await RequestStore.open(join(directory, "requests.json"));
  assert.equal(reopenedStore.pendingNotifications()[0]?.notificationEvent?.message, "คำขอเข้ากลุ่มถูกปฏิเสธ");
  await retryPendingNotifications(reopenedStore, notifications);
  assert.equal(reopenedStore.get(created.id)?.notificationStatus, "sent");
  assert.equal(notifications.events.length, 2);
  assert.deepEqual(notifications.events[0], notifications.events[1]);
});

test("HTTP Group client follows the internal service-token contract", async () => {
  const calls: Array<{ method: string; url: string; authorization: string | undefined; serviceToken: string | undefined; body: string }> = [];
  const groupServer = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    calls.push({
      method: request.method ?? "",
      url: request.url ?? "",
      authorization: request.headers.authorization,
      serviceToken: Array.isArray(request.headers["x-service-token"])
        ? request.headers["x-service-token"][0]
        : request.headers["x-service-token"],
      body,
    });
    response.setHeader("Content-Type", "application/json");
    if (request.method === "POST" && body.includes('"userId":"full"')) {
      response.writeHead(422).end(JSON.stringify({ error: "capacity_exceeded", message: "Group is full" }));
      return;
    }
    if (request.method === "POST") {
      response.end(JSON.stringify({ memberCount: 2 }));
      return;
    }
    response.end(JSON.stringify(groups.group));
  });
  groupServer.listen(0);
  await new Promise<void>((resolve) => groupServer.once("listening", resolve));
  const address = groupServer.address() as AddressInfo;
  const client = new HttpGroupClient(`http://127.0.0.1:${address.port}`, serviceToken);
  try {
    const group = await client.getGroup("group-1", "owner-token");
    assert.equal(group.id, "group-1");
    await client.addMember("group-1", "student-1");
    await assert.rejects(
      client.addMember("group-1", "full"),
      (error: unknown) => error instanceof GroupServiceError && error.status === 422,
    );
    assert.deepEqual(calls.map((call) => [call.method, call.url, call.authorization, call.serviceToken]), [
      ["GET", "/api/groups/group-1", "Bearer owner-token", undefined],
      ["POST", "/internal/groups/group-1/members", undefined, serviceToken],
      ["POST", "/internal/groups/group-1/members", undefined, serviceToken],
    ]);
    assert.equal(calls[1]?.body, '{"userId":"student-1"}');
  } finally {
    groupServer.close();
    await new Promise<void>((resolve) => groupServer.once("close", resolve));
  }
});

test("HTTP Notification client sends the contract payload and accepts idempotent 200", async () => {
  const calls: Array<{ url: string; serviceToken: string | undefined; body: string }> = [];
  const notificationServer = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    calls.push({
      url: request.url ?? "",
      serviceToken: Array.isArray(request.headers["x-service-token"])
        ? request.headers["x-service-token"][0]
        : request.headers["x-service-token"],
      body,
    });
    response.writeHead(calls.length === 1 ? 201 : 200).end("{}");
  });
  notificationServer.listen(0);
  await new Promise<void>((resolve) => notificationServer.once("listening", resolve));
  const address = notificationServer.address() as AddressInfo;
  const client = new HttpNotificationClient(`http://127.0.0.1:${address.port}`, "notify-service-secret");
  const event: NotificationEvent = {
    userId: "student-1",
    type: "request_approved",
    message: "Request approved",
    relatedId: "request-1",
  };
  try {
    await client.send(event);
    await client.send(event);
    assert.deepEqual(calls, [
      {
        url: "/internal/notifications",
        serviceToken: "notify-service-secret",
        body: JSON.stringify(event),
      },
      {
        url: "/internal/notifications",
        serviceToken: "notify-service-secret",
        body: JSON.stringify(event),
      },
    ]);
  } finally {
    notificationServer.close();
    await new Promise<void>((resolve) => notificationServer.once("close", resolve));
  }
});
