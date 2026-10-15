import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { ProfileStore } from "./profile-store.js";

const secret = "test-only-secret";
const serviceToken = "test-only-service-token";
let directory: string;
let server: Server;
let baseUrl: string;
let token: string;
let profileStore: ProfileStore;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "study-buddy-profile-"));
  // Start from a fixture file containing the user provisioned by the Auth/user onboarding flow.
  await writeFile(join(directory, "profiles.json"), JSON.stringify([
    { id: "user-1", name: "กิต", email: "kit@example.test", subjects: ["ชีววิทยา"] },
    { id: "user-2", name: "เมย์", subjects: ["ชีววิทยา", "เคมี"] }
  ]));
  profileStore = await ProfileStore.open(join(directory, "profiles.json"));
  server = createApp(profileStore, secret, serviceToken).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = jwt.sign({ userId: "user-1" }, secret, { algorithm: "HS256", expiresIn: "5m" });
});

afterEach(async () => {
  server.close();
  await new Promise<void>((resolve) => server.once("close", resolve));
  await rm(directory, { recursive: true, force: true });
});

test("GET profile returns the authenticated user's profile", async () => {
  const response = await fetch(`${baseUrl}/api/users/user-1`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: "user-1", name: "กิต", email: "kit@example.test", subjects: ["ชีววิทยา"]
  });
});

test("GET profile returns 404 for an unknown user", async () => {
  const response = await fetch(`${baseUrl}/api/users/user-1-missing`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 403, "a different ID is forbidden before lookup");
  const missingOwnUserToken = jwt.sign({ userId: "missing" }, secret, { algorithm: "HS256", expiresIn: "5m" });
  const missingResponse = await fetch(`${baseUrl}/api/users/missing`, { headers: { Authorization: `Bearer ${missingOwnUserToken}` } });
  assert.equal(missingResponse.status, 404);
});

test("PUT profile saves trimmed subjects", async () => {
  const response = await fetch(`${baseUrl}/api/users/user-1`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subjects: [" ฟิสิกส์ ", "แคลคูลัส"] })
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { subjects: string[] }).subjects, ["ฟิสิกส์", "แคลคูลัส"]);
});

test("PUT profile rejects empty subjects and case-insensitive duplicates", async () => {
  for (const subjects of [["Math", " math "], [" "]]) {
    const response = await fetch(`${baseUrl}/api/users/user-1`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subjects })
    });
    assert.equal(response.status, 400);
  }
});

test("search finds matching subjects case-insensitively and returns an empty array when absent", async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const found = await fetch(`${baseUrl}/api/users/search?subject=${encodeURIComponent("ชีววิทยา")}`, { headers });
  assert.equal(found.status, 200);
  assert.equal((await found.json() as unknown[]).length, 2);
  const absent = await fetch(`${baseUrl}/api/users/search?subject=Physics`, { headers });
  assert.deepEqual(await absent.json(), []);
});

test("protected routes reject missing and invalid tokens", async () => {
  const missing = await fetch(`${baseUrl}/api/users/search?subject=Chemistry`);
  assert.equal(missing.status, 401);
  const invalid = await fetch(`${baseUrl}/api/users/search?subject=Chemistry`, { headers: { Authorization: "Bearer invalid" } });
  assert.equal(invalid.status, 401);
});

test("JWTs without exp or with an expired exp are rejected", async () => {
  const noExpiry = jwt.sign({ userId: "user-1" }, secret, { algorithm: "HS256", noTimestamp: true });
  const expired = jwt.sign({ userId: "user-1" }, secret, { algorithm: "HS256", expiresIn: -10 });
  for (const invalidToken of [noExpiry, expired]) {
    const response = await fetch(`${baseUrl}/api/users/user-1`, { headers: { Authorization: `Bearer ${invalidToken}` } });
    assert.equal(response.status, 401);
  }
});

test("unknown routes return contract-shaped JSON 404 responses", async () => {
  const response = await fetch(`${baseUrl}/missing-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found", message: "Route not found" });
});

test("PUT cannot update a different user's profile", async () => {
  const response = await fetch(`${baseUrl}/api/users/user-2`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subjects: ["ฟิสิกส์"] })
  });
  assert.equal(response.status, 403);
});

test("internal create provisions a profile with an empty subject list", async () => {
  const response = await fetch(`${baseUrl}/internal/users`, {
    method: "POST", headers: { "X-Service-Token": serviceToken, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "user-3", name: "นัท", email: "nut@example.test" })
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    id: "user-3", name: "นัท", email: "nut@example.test", subjects: []
  });
});

test("internal create retry returns 200 and does not create a duplicate", async () => {
  const options = {
    method: "POST",
    headers: { "X-Service-Token": serviceToken, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "user-3", name: "นัท", email: "nut@example.test" })
  };
  const first = await fetch(`${baseUrl}/internal/users`, options);
  await profileStore.setSubjects("user-3", ["แคลคูลัส"]);
  const retry = await fetch(`${baseUrl}/internal/users`, options);
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json() as { subjects: string[] }).subjects, ["แคลคูลัส"]);
  const records = JSON.parse(await readFile(join(directory, "profiles.json"), "utf8"));
  assert.equal(records.filter((profile: { id: string }) => profile.id === "user-3").length, 1);
});

test("internal create rejects reused IDs with different identity data", async () => {
  const response = await fetch(`${baseUrl}/internal/users`, {
    method: "POST", headers: { "X-Service-Token": serviceToken, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "user-1", name: "Different Name", email: "different@example.test" })
  });
  assert.equal(response.status, 409);
  const profile = await fetch(`${baseUrl}/api/users/user-1`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await profile.json() as { name: string }).name, "กิต");
});

test("internal create requires a valid service token", async () => {
  const headerCases: HeadersInit[] = [
    { "Content-Type": "application/json" },
    { "X-Service-Token": "wrong-token", "Content-Type": "application/json" }
  ];
  for (const headers of headerCases) {
    const response = await fetch(`${baseUrl}/internal/users`, {
      method: "POST", headers,
      body: JSON.stringify({ id: "user-3", name: "นัท", email: "nut@example.test" })
    });
    assert.equal(response.status, 401);
  }
});

test("internal create rejects missing or invalid fields", async () => {
  for (const body of [
    { id: "user-3", name: "นัท" },
    { id: "user-3", name: " ", email: "nut@example.test" },
    { id: "user-3", name: "นัท", email: 7 },
    { id: "user-3", name: "นัท", email: "not-an-email" }
  ]) {
    const response = await fetch(`${baseUrl}/internal/users`, {
      method: "POST", headers: { "X-Service-Token": serviceToken, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 400);
  }
  assert.equal(profileStore.get("user-3"), undefined, "invalid profiles must not be persisted");
});

test("failed JSON writes do not change memory and a later write can succeed", async () => {
  const filePath = join(directory, "profiles.json");
  await rm(directory, { recursive: true, force: true });
  await writeFile(directory, "blocks-directory-creation");

  await assert.rejects(profileStore.setSubjects("user-1", ["ฟิสิกส์"]));
  assert.deepEqual(profileStore.get("user-1")?.subjects, ["ชีววิทยา"]);

  await rm(directory, { force: true });
  await profileStore.setSubjects("user-1", ["ฟิสิกส์"]);
  assert.deepEqual(profileStore.get("user-1")?.subjects, ["ฟิสิกส์"]);
  const persisted = JSON.parse(await readFile(filePath, "utf8"));
  assert.deepEqual(persisted.find((profile: { id: string }) => profile.id === "user-1").subjects, ["ฟิสิกส์"]);
});
