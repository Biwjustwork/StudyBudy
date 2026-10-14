import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { GroupStore } from "./group-store.js";

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
