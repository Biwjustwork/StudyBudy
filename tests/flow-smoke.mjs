import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const services = {
  auth: process.env.AUTH_URL ?? "http://127.0.0.1:3001",
  profile: process.env.PROFILE_URL ?? "http://127.0.0.1:3002",
  group: process.env.GROUP_URL ?? "http://127.0.0.1:3003",
  membership: process.env.MEMBERSHIP_URL ?? "http://127.0.0.1:3004",
  notification: process.env.NOTIFICATION_URL ?? "http://127.0.0.1:3005",
};

async function request(service, path, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${services[service]}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : undefined; } catch {
    throw new Error(`${service} ${method} ${path} returned non-JSON (${response.status})`);
  }
  return { status: response.status, data };
}

function expectStatus(result, expected, step) {
  assert.equal(result.status, expected, `${step}: expected HTTP ${expected}, received ${result.status}`);
  return result.data;
}

async function createAccount(label) {
  const email = `flow-${label}-${randomUUID()}@example.test`;
  const name = `Flow ${label}`;
  const password = "StudyBuddy!2026";
  const registered = expectStatus(await request("auth", "/api/register", {
    method: "POST", body: { email, name, password },
  }), 201, `${label}: registration`);
  assert.equal(registered.email, email);
  assert.equal(typeof registered.userId, "string");
  assert.equal("password" in registered, false, `${label}: registration must not return a password`);

  const login = expectStatus(await request("auth", "/api/login", {
    method: "POST", body: { email, password },
  }), 200, `${label}: login`);
  assert.equal(login.userId, registered.userId);
  assert.equal(typeof login.token, "string");

  const me = expectStatus(await request("auth", "/api/me", { token: login.token }), 200, `${label}: current user`);
  assert.equal(me.userId, registered.userId);
  return { email, name, userId: registered.userId, token: login.token };
}

async function main() {
  for (const [service, baseUrl] of Object.entries(services)) {
    const health = expectStatus(await request(service, "/health"), 200, `${service}: health`);
    assert.equal(health.status, "ok", `${service}: health status`);
    console.log(`PASS health: ${service}`);
  }

  const owner = await createAccount("owner");
  console.log("PASS register, profile provisioning, login, and /api/me: owner");
  const ownerProfile = expectStatus(await request("profile", `/api/users/${encodeURIComponent(owner.userId)}`, {
    token: owner.token,
  }), 200, "owner: initial profile");
  assert.deepEqual(ownerProfile.subjects, []);

  const subject = `E2E-${randomUUID().slice(0, 8)}`;
  const updatedProfile = expectStatus(await request("profile", `/api/users/${encodeURIComponent(owner.userId)}`, {
    token: owner.token, method: "PUT", body: { subjects: [subject] },
  }), 200, "owner: save subject");
  assert.deepEqual(updatedProfile.subjects, [subject]);

  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const group = expectStatus(await request("group", "/api/groups", {
    token: owner.token,
    method: "POST",
    body: { subject, topic: "Automated flow check", startsAt, maxMembers: 4, location: "Online" },
  }), 201, "owner: create group");
  assert.equal(group.ownerId, owner.userId);
  assert.deepEqual(group.members, [owner.userId]);
  console.log("PASS profile update and group creation");

  const requester = await createAccount("requester");
  expectStatus(await request("profile", `/api/users/${encodeURIComponent(requester.userId)}`, {
    token: requester.token, method: "PUT", body: { subjects: [subject] },
  }), 200, "requester: save subject");
  const classmates = expectStatus(await request("profile", `/api/users/search?subject=${encodeURIComponent(subject)}`, {
    token: requester.token,
  }), 200, "requester: search classmates");
  assert.ok(classmates.some((person) => person.id === owner.userId));

  const matchingGroups = expectStatus(await request("group", `/api/groups?subject=${encodeURIComponent(subject)}&openOnly=true`, {
    token: requester.token,
  }), 200, "requester: search groups");
  assert.ok(matchingGroups.some((item) => item.id === group.id));

  const membershipRequest = expectStatus(await request("membership", "/api/requests", {
    token: requester.token, method: "POST", body: { groupId: group.id },
  }), 201, "requester: join request");
  assert.equal(membershipRequest.status, "pending");
  assert.equal(membershipRequest.requesterId, requester.userId);
  expectStatus(await request("membership", "/api/requests", {
    token: requester.token, method: "POST", body: { groupId: group.id },
  }), 409, "requester: duplicate join request");

  const ownerRequests = expectStatus(await request("membership", `/api/requests?groupId=${encodeURIComponent(group.id)}`, {
    token: owner.token,
  }), 200, "owner: list join requests");
  assert.ok(ownerRequests.some((item) => item.id === membershipRequest.id));

  const decision = expectStatus(await request("membership", `/api/requests/${encodeURIComponent(membershipRequest.id)}/approve`, {
    token: owner.token, method: "POST",
  }), 200, "owner: approve request");
  assert.equal(decision.status, "approved");

  const updatedGroup = expectStatus(await request("group", `/api/groups/${encodeURIComponent(group.id)}`, {
    token: requester.token,
  }), 200, "requester: verify group membership");
  assert.ok(updatedGroup.members.includes(requester.userId));

  const notifications = expectStatus(await request("notification", "/api/notifications", {
    token: requester.token,
  }), 200, "requester: list notifications");
  const notification = notifications.find((item) => item.relatedId === membershipRequest.id);
  assert.ok(notification, "requester should receive a notification for the approved request");
  assert.equal(notification.type, "request_approved");
  assert.equal(notification.read, false);

  const readNotification = expectStatus(await request("notification", `/api/notifications/${encodeURIComponent(notification.id)}/read`, {
    token: requester.token, method: "PATCH",
  }), 200, "requester: mark notification read");
  assert.equal(readNotification.read, true);
  console.log("PASS search, request, owner approval, group membership, notification, and mark-as-read");
  console.log("FLOW-01 PASS: complete cross-service Study Buddy flow");
}

main().catch((error) => {
  console.error(`FLOW-01 FAIL: ${error.message}`);
  process.exitCode = 1;
});
