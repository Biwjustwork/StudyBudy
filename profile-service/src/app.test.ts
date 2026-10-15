import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { ProfileStore } from "./profile-store.js";

const secret = "test-only-secret";
let directory: string;
let server: Server;
let baseUrl: string;
let token: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "study-buddy-profile-"));
  // Start from a fixture file containing the user provisioned by the Auth/user onboarding flow.
  await writeFile(join(directory, "profiles.json"), JSON.stringify([
    { id: "user-1", name: "กิต", email: "kit@example.test", subjects: ["ชีววิทยา"] },
    { id: "user-2", name: "เมย์", subjects: ["ชีววิทยา", "เคมี"] }
  ]));
  const seededStore = await ProfileStore.open(join(directory, "profiles.json"));
  server = createApp(seededStore, secret).listen(0);
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
  const missingOwnUserToken = jwt.sign({ userId: "missing" }, secret, { algorithm: "HS256" });
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

test("PUT cannot update a different user's profile", async () => {
  const response = await fetch(`${baseUrl}/api/users/user-2`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subjects: ["ฟิสิกส์"] })
  });
  assert.equal(response.status, 403);
});
