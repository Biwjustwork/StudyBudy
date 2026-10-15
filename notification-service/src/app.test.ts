import assert from "node:assert/strict";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { createApp } from "./app.js";
import { NotificationStore } from "./notification-store.js";

const secret = "test-only-jwt-secret-with-at-least-32-characters";
const serviceToken = "test-only-internal-notification-token";
const token = (userId: string) => jwt.sign({ userId }, secret, { algorithm: "HS256", expiresIn: "1h" });
const event = { userId: "user-a", type: "request_approved", message: "คำขอได้รับอนุมัติ", relatedId: "request-1" };
let directory: string;
let dataFile: string;
let store: NotificationStore;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "study-buddy-notification-"));
  dataFile = join(directory, "data", "notifications.json");
  store = await NotificationStore.open(dataFile);
  server = createApp(store, secret, serviceToken).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

function api(path: string, options: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

function deliver(body: unknown = event, suppliedToken: string | null = serviceToken) {
  return api("/internal/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(suppliedToken === null ? {} : { "X-Service-Token": suppliedToken }) },
    body: JSON.stringify(body),
  });
}

function list(user = "user-a", query = "") {
  return api(`/api/notifications${query}`, { headers: { Authorization: `Bearer ${token(user)}` } });
}

function mark(id: string, user = "user-a") {
  return api(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token(user)}` },
  });
}

test("health is public and identifies the notification service", async () => {
  const response = await api("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "notification" });
});

test("NOTI-01: internal delivery creates a persisted unread notification", async () => {
  const response = await deliver();
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(typeof body.id, "string");
  assert.deepEqual({ userId: body.userId, type: body.type, message: body.message, relatedId: body.relatedId }, event);
  assert.equal(body.read, false);
  assert.equal(body.readAt, null);
  assert.ok(Number.isFinite(Date.parse(body.createdAt)));
  assert.deepEqual(JSON.parse(await readFile(dataFile, "utf8")), [body]);
});

test("internal delivery rejects missing, wrong and user Bearer tokens", async () => {
  for (const supplied of [null, "wrong-token", token("user-a")]) {
    const response = await deliver(event, supplied);
    assert.equal(response.status, 401);
    assert.equal(typeof (await response.json()).error, "string");
  }
  const bearerOnly = await api("/internal/notifications", {
    method: "POST", headers: { Authorization: `Bearer ${token("user-a")}`, "Content-Type": "application/json" }, body: JSON.stringify(event),
  });
  assert.equal(bearerOnly.status, 401);
  assert.deepEqual(await (await list()).json(), []);
});

test("delivery validates all required fields and supported event types without saving", async () => {
  for (const invalid of [null, [], {}, { ...event, userId: "  " }, { ...event, userId: 1 },
    { ...event, type: "other" }, { ...event, message: " " }, { ...event, relatedId: "" }, { ...event, message: "x".repeat(2001) }]) {
    assert.equal((await deliver(invalid)).status, 400, JSON.stringify(invalid));
  }
  assert.deepEqual(await (await list()).json(), []);
});

test("delivery trims text fields and supports rejected requests", async () => {
  const response = await deliver({ userId: " user-a ", type: "request_rejected", message: " ปฏิเสธแล้ว ", relatedId: " request-2 " });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.userId, "user-a");
  assert.equal(body.message, "ปฏิเสธแล้ว");
  assert.equal(body.relatedId, "request-2");
  assert.equal(body.type, "request_rejected");
});

test("NOTI-02: list is newest first and contains only the token user's records", async () => {
  const first = await (await deliver()).json();
  await deliver({ ...event, userId: "user-b", relatedId: "request-b" });
  const second = await (await deliver({ ...event, relatedId: "request-2" })).json();
  const response = await list();
  assert.equal(response.status, 200);
  const items = await response.json();
  assert.deepEqual(items.map((item: { id: string }) => item.id), [second.id, first.id]);
  assert.equal((await (await list("user-b", "?userId=user-a")).json()).length, 1);
  assert.deepEqual(await (await list("user-with-no-events")).json(), []);
});

test("protected APIs reject malformed, expired, wrong-algorithm and incomplete JWTs", async () => {
  const badTokens = ["bad-token", jwt.sign({ userId: "user-a", exp: 1 }, secret),
    jwt.sign({ userId: "user-a" }, secret, { algorithm: "HS384", expiresIn: "1h" }),
    jwt.sign({ userId: "user-a" }, secret), jwt.sign({}, secret, { expiresIn: "1h" }),
    jwt.sign({ userId: " " }, secret, { expiresIn: "1h" }), token("user-a") + "tampered"];
  assert.equal((await api("/api/notifications")).status, 401);
  for (const bad of badTokens) {
    for (const [path, method] of [["/api/notifications", "GET"], ["/api/notifications/missing/read", "PATCH"]]) {
      const response = await api(path, { method, headers: { Authorization: `Bearer ${bad}` } });
      assert.equal(response.status, 401);
    }
  }
});

test("NOTI-02: mark-read persists and repeating it preserves the original read time", async () => {
  const created = await (await deliver()).json();
  const response = await mark(created.id);
  assert.equal(response.status, 200);
  const read = await response.json();
  assert.equal(read.read, true);
  assert.ok(Number.isFinite(Date.parse(read.readAt)));
  assert.equal((await (await mark(created.id)).json()).readAt, read.readAt);
  assert.equal((await (await list()).json())[0].read, true);
  assert.deepEqual(JSON.parse(await readFile(dataFile, "utf8")), [read]);
});

test("NOTI-03: another user cannot mark a notification or change its state", async () => {
  const created = await (await deliver()).json();
  assert.equal((await mark(created.id, "user-b")).status, 403);
  assert.equal((await (await list()).json())[0].read, false);
  assert.deepEqual(await (await list("user-b")).json(), []);
});

test("mark-read returns JSON 404 for an unknown notification", async () => {
  const response = await mark("missing-id");
  assert.equal(response.status, 404);
  const error = await response.json();
  assert.equal(typeof error.error, "string");
  assert.equal(typeof error.message, "string");
});

test("identical event retry returns the existing record without resetting read state", async () => {
  const created = await (await deliver()).json();
  await mark(created.id);
  const retry = await deliver();
  assert.equal(retry.status, 200);
  const body = await retry.json();
  assert.equal(body.id, created.id);
  assert.equal(body.read, true);
  assert.equal((await (await list()).json()).length, 1);
});

test("concurrent duplicate deliveries create one record and return one stable ID", async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => deliver()));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 200).length, 7);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(bodies.map((body) => body.id)).size, 1);
  assert.equal(JSON.parse(await readFile(dataFile, "utf8")).length, 1);
});

test("retry with a conflicting message returns 409 and preserves the saved event", async () => {
  await deliver();
  assert.equal((await deliver({ ...event, message: "different message" })).status, 409);
  assert.equal((await (await list()).json())[0].message, event.message);
});

test("DATA-01: create, mark-read and retry survive reopening the JSON repository", async () => {
  const created = await (await deliver()).json();
  await mark(created.id);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  store = await NotificationStore.open(dataFile);
  server = createApp(store, secret, serviceToken).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await deliver();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, created.id);
  assert.equal(body.read, true);
  assert.equal((await (await list()).json()).length, 1);
});

test("failed writes return a safe error, leave no phantom notification, and allow a later retry", async () => {
  const folder = join(directory, "data");
  const backup = join(directory, "backup");
  await rename(folder, backup);
  await writeFile(folder, "block directory creation");
  const failed = await deliver();
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "internal_error", message: "An unexpected error occurred" });
  assert.deepEqual(await (await list()).json(), []);
  await rm(folder);
  await rename(backup, folder);
  assert.equal((await deliver()).status, 201);
  assert.equal((await (await list()).json()).length, 1);
});

test("invalid or duplicate saved records stop startup without overwriting the file", async () => {
  const saved = await (await deliver()).json();
  for (const bad of ["invalid json", "{}", '[{"id":"invalid"}]', JSON.stringify([saved, saved])]) {
    const path = join(directory, "invalid.json");
    await writeFile(path, bad);
    await assert.rejects(NotificationStore.open(path));
    assert.equal(await readFile(path, "utf8"), bad);
  }
});

test("malformed JSON and oversized requests return the shared JSON error envelope", async () => {
  for (const [body, expected] of [["{", 400], [JSON.stringify({ ...event, message: "x".repeat(40000) }), 413]] as const) {
    const response = await api("/internal/notifications", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Service-Token": serviceToken }, body,
    });
    assert.equal(response.status, expected);
    const error = await response.json();
    assert.equal(typeof error.error, "string");
    assert.equal(typeof error.message, "string");
  }
});

test("browser preflight supports the API's PATCH and authorization headers", async () => {
  const response = await api("/api/notifications/missing/read", { method: "OPTIONS" });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Methods") ?? "", /PATCH/);
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /Authorization/i);
});
