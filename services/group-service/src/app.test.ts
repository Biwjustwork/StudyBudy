import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { GroupStore, type Group } from "./group-store.js";

const secret = "test-only-secret";
const serviceToken = "test-only-secret";
let directory: string;
let server: Server;
let baseUrl: string;
let token: string;
let store: GroupStore;

// เตรียมเครื่องมือเทสต์: วันที่ในอนาคต + body มาตรฐานที่ใช้สร้างกลุ่ม
const dayMs = 86400000;
const futureDate = (offsetDays: number) => new Date(Date.now() + offsetDays * dayMs).toISOString();

const validBody = {
  subject: "Calculus",
  topic: "Limits",
  startsAt: futureDate(30),
  maxMembers: 5,
  location: "Library 3F",
};

function authJson(t: string): Record<string, string> {
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

// ก่อนทุกเคส: สร้าง store ชั่วคราว + เปิด server พอร์ตสุ่ม + ออก JWT ของ user-1
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "study-buddy-group-"));
  store = await GroupStore.open(join(directory, "groups.json"));
  server = createApp(store, secret, serviceToken).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = jwt.sign({ userId: "user-1" }, secret, { algorithm: "HS256", expiresIn: "5m" });
});

// หลังทุกเคส: ปิด server + ลบไฟล์ชั่วคราวทิ้ง
afterEach(async () => {
  server.close();
  await new Promise<void>((resolve) => server.once("close", resolve));
  await rm(directory, { recursive: true, force: true });
});

// U01: health check ต้องตอบ 200 โดยไม่ใช้ token
test("GET /health returns ok without token", async () => {
  const r = await fetch(`${baseUrl}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: "ok", service: "group" });
});

// U02: เรียก /api โดยไม่ส่ง token ต้องได้ 401 รูป {error, message}
test("API without token returns 401 {error,message}", async () => {
  const r = await fetch(`${baseUrl}/api/groups`);
  assert.equal(r.status, 401);
  assert.deepEqual(Object.keys(await r.json()).sort(), ["error", "message"]);
});

// U03: สร้างกลุ่มข้อมูลครบต้องได้ 201 และ ownerId/members มาจาก token (user-1)
test("POST creates group with valid input and sets owner from token", async () => {
  const r = await fetch(`${baseUrl}/api/groups`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "Calculus", topic: "Limits", startsAt: futureDate(30), maxMembers: 5, location: "Library 3F" }) });
  assert.equal(r.status, 201);
  const g = await r.json() as Group;
  assert.equal(g.ownerId, "user-1"); assert.deepEqual(g.members, ["user-1"]);
});

// U04: body ขาดฟิลด์ / วันเวลามั่ว / maxMembers เป็น 0 หรือทศนิยม ต้องโดน 400 ทั้งหมด
test("POST rejects missing subject/startsAt and non-positive maxMembers with 400", async () => {
  for (const body of [{ topic: "x" }, { subject: "Cal", topic: "t", startsAt: "not-a-date", maxMembers: 5, location: "l" }, { subject: "Cal", topic: "t", startsAt: futureDate(30), maxMembers: 0, location: "l" }, { subject: "Cal", topic: "t", startsAt: futureDate(30), maxMembers: 2.5, location: "l" }]) {
    const r = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(r.status, 400);
  }
});

// U07: ค้นหาต้องไม่สนตัวพิมพ์ (ส่ง "  CALCULUS " มีช่องว่างก็เจอ) openOnly ซ่อนกลุ่มเต็ม/กลุ่มปิด และผลเรียงตาม startsAt
test("GET search filters by subject case-insensitively and openOnly hides full/closed groups", async () => {
  async function create(body: unknown): Promise<Group> {
    const r = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify(body) });
    assert.equal(r.status, 201);
    return (await r.json()) as Group;
  }
  await create({ ...validBody, subject: "Calculus", startsAt: futureDate(33), maxMembers: 5 });
  await create({ ...validBody, subject: "Calculus", startsAt: futureDate(32), maxMembers: 1 });
  await create({ ...validBody, subject: "Calculus", startsAt: futureDate(34), maxMembers: 5, isOpen: false });
  await create({ ...validBody, subject: "Physics", startsAt: futureDate(31), maxMembers: 5 });

  const open = await (await fetch(`${baseUrl}/api/groups?subject=${encodeURIComponent("  CALCULUS ")}&openOnly=true`, { headers: { Authorization: `Bearer ${token}` } })).json() as Group[];
  assert.equal(open.length, 1);
  assert.ok(open.every((g) => g.subject.toLocaleLowerCase() === "calculus" && g.members.length < g.maxMembers && g.isOpen));

  const all = await (await fetch(`${baseUrl}/api/groups`, { headers: { Authorization: `Bearer ${token}` } })).json() as Group[];
  assert.equal(all.length, 4);
  const times = all.map((g) => Date.parse(g.startsAt));
  assert.deepEqual([...times].sort((a, b) => a - b), times);
});

// U08: อ่านด้วย id ที่มีอยู่ได้ 200 / id มั่วได้ 404 not_found
test("GET by id returns group, 404 for missing", async () => {
  const created = await (await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify(validBody) })).json() as Group;
  const found = await fetch(`${baseUrl}/api/groups/${created.id}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(found.status, 200);
  assert.equal(((await found.json()) as Group).id, created.id);
  const missing = await fetch(`${baseUrl}/api/groups/no-such-id`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { error: string }).error, "not_found");
});

// U09: เจ้าของ PATCH ได้ 200 (ownerId/members ไม่เปลี่ยน) / คนอื่นแตะได้ 403 forbidden
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

// U10: PATCH ลด maxMembers ต่ำกว่าสมาชิกปัจจุบัน / ส่ง startsAt เป็น "tomorrow" ต้องโดน 400 ทั้งคู่
test("PATCH rejects shrinking maxMembers below current members and bad startsAt", async () => {
  const created = await (await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify({ ...validBody, maxMembers: 3 }) })).json() as Group;
  // ยัดสมาชิกเพิ่มตรง ๆ ผ่าน store (ไม่ผ่าน endpoint กันเทสต์ผูกกันเอง)
  // Seed 3 members via the store directly (no forward dep on Task 5 endpoint).
  await store.update(created.id, { members: ["user-1", "user-2", "user-3"] });
  const shrink = await fetch(`${baseUrl}/api/groups/${created.id}`, { method: "PATCH", headers: authJson(token), body: JSON.stringify({ maxMembers: 2 }) });
  assert.equal(shrink.status, 400);
  assert.equal(((await shrink.json()) as { error: string }).error, "validation_error");
  const badDate = await fetch(`${baseUrl}/api/groups/${created.id}`, { method: "PATCH", headers: authJson(token), body: JSON.stringify({ startsAt: "tomorrow" }) });
  assert.equal(badDate.status, 400);
  assert.equal(((await badDate.json()) as { error: string }).error, "validation_error");
});

// ตัวช่วยสร้างกลุ่มผ่าน API (แตก 201 ถ้าสร้างไม่ผ่าน)
async function createGroup(authToken: string, body: unknown): Promise<Group> {
  const r = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(authToken), body: JSON.stringify(body) });
  assert.equal(r.status, 201);
  return (await r.json()) as Group;
}

// ตัวช่วยยิง internal เพิ่มสมาชิก (ใส่ x-service-token ให้ เว้นแต่จงใจไม่ส่งเพื่อเทสต์ 401)
async function postMember(groupId: string, userId: unknown, svcToken: string | undefined = serviceToken): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (svcToken !== undefined) headers["x-service-token"] = svcToken;
  return fetch(`${baseUrl}/internal/groups/${groupId}/members`, { method: "POST", headers, body: JSON.stringify({ userId }) });
}

// U11: กลุ่ม maxMembers=2 เพิ่ม user-2 ได้ 200 / เพิ่มซ้ำได้ 409 conflict / เต็มแล้วเพิ่ม user-3 ได้ 422
test("service token can add member once, duplicate is 409, full group is 422", async () => {
  const g = await createGroup(token, { ...validBody, maxMembers: 2 });
  const first = await postMember(g.id, "user-2");
  assert.equal(first.status, 200);
  const added = (await first.json()) as Group;
  assert.ok(added.members.includes("user-2"));
  const dup = await postMember(g.id, "user-2");
  assert.equal(dup.status, 409);
  assert.equal(((await dup.json()) as { error: string }).error, "conflict");
  // ตอนนี้กลุ่มเต็ม 2/2 แล้ว คนใหม่ต้องถูกปฏิเสธ
  // Group is now full (2/2); next distinct user must be rejected.
  const full = await postMember(g.id, "user-3");
  assert.equal(full.status, 422);
  assert.equal(((await full.json()) as { error: string }).error, "capacity_exceeded");
});

// Route เก่าสมัยใช้ owner token ถูกถอดแล้ว ต้องได้ 404
test("old owner member route is gone (404)", async () => {
  const g = await createGroup(token, validBody);
  const r = await fetch(`${baseUrl}/api/groups/${g.id}/members`, { method: "POST", headers: authJson(token), body: JSON.stringify({ userId: "user-2" }) });
  assert.equal(r.status, 404);
});

// U12: internal ไม่ส่ง token / ส่งสตริงว่าง ต้องได้ 401 ทั้งคู่
test("missing or empty service token is 401", async () => {
  const g = await createGroup(token, validBody);
  const missing = await fetch(`${baseUrl}/internal/groups/${g.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: "user-2" }) });
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { error: "unauthorized", message: "Service token is invalid" });
  const empty = await postMember(g.id, "user-2", "");
  assert.equal(empty.status, 401);
  assert.deepEqual(await empty.json(), { error: "unauthorized", message: "Service token is invalid" });
});

// U13a: ส่ง service token ผิดค่าได้ 401 (กัน Membership ตั้งค่าผิด env)
test("wrong service token value is 401", async () => {
  const g = await createGroup(token, validBody);
  const r = await postMember(g.id, "user-2", "wrong-secret");
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "unauthorized", message: "Service token is invalid" });
});

// U13b: เอา JWT ของ user มาแปะช่อง x-service-token ต้องไม่ผ่าน (กันสับสน token สองชนิด)
test("Auth JWT sent as x-service-token is 401", async () => {
  const g = await createGroup(token, validBody);
  const r = await postMember(g.id, "user-2", token);
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "unauthorized", message: "Service token is invalid" });
});

// เพิ่มสมาชิกให้กลุ่มที่ไม่มีอยู่จริงได้ 404 not_found
test("adding a member to an unknown group is 404", async () => {
  const r = await postMember("no-such-id", "user-2");
  assert.equal(r.status, 404);
  assert.equal(((await r.json()) as { error: string }).error, "not_found");
});

// U14+U15: startsAt อดีต (2020) ได้ 400 / userId ว่างได้ 400 / ปิดกลุ่มแล้วเพิ่มสมาชิกได้ 422 capacity_exceeded
test("past startsAt, empty userId, and closed group are rejected", async () => {
  const past = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify({ ...validBody, startsAt: "2020-01-01T00:00:00Z" }) });
  assert.equal(past.status, 400);
  assert.equal(((await past.json()) as { error: string }).error, "validation_error");
  const g = await createGroup(token, validBody);
  const empty = await postMember(g.id, "   ");
  assert.equal(empty.status, 400);
  const closed = await fetch(`${baseUrl}/api/groups/${g.id}`, { method: "PATCH", headers: authJson(token), body: JSON.stringify({ isOpen: false }) });
  assert.equal(closed.status, 200);
  const denied = await postMember(g.id, "user-2");
  assert.equal(denied.status, 422);
  assert.equal(((await denied.json()) as { error: string }).error, "capacity_exceeded");
});

// U05: startsAt ไม่มี timezone ต่อท้าย (เช่น "2026-11-01T10:00:00") ต้องโดน 400
test("startsAt without timezone is rejected", async () => {
  const noTz = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify({ ...validBody, startsAt: "2026-11-01T10:00:00" }) });
  assert.equal(noTz.status, 400);
  assert.equal(((await noTz.json()) as { error: string }).error, "validation_error");
});

// U06: ส่งฟิลด์เก่า datetime โดยไม่มี startsAt ได้ 400 / แบบลงท้าย Z ได้ 201
test("legacy field without startsAt is rejected, Z-suffixed ISO is accepted", async () => {
  const legacy = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify({ subject: "Calculus", topic: "Limits", datetime: futureDate(30), maxMembers: 5, location: "Library 3F" }) });
  assert.equal(legacy.status, 400);
  assert.equal(((await legacy.json()) as { error: string }).error, "validation_error");
  const zulu = await fetch(`${baseUrl}/api/groups`, { method: "POST", headers: authJson(token), body: JSON.stringify(validBody) });
  assert.equal(zulu.status, 201);
});

// U16: แกล้งทำ disk พัง (เอาไฟล์มาขวาง path) การเซฟต้องล้ม 1 ครั้ง แต่ซ่อมแล้วเซฟครั้งต่อไปต้องผ่าน (คิวไม่พังถาวร)
test("a failed save does not break later saves", async () => {
  const sub = join(directory, "sub");
  const file = join(sub, "groups.json");
  const store2 = await GroupStore.open(file);
  const input = { ...validBody, ownerId: "user-1", members: ["user-1"], isOpen: true };
  await store2.create(input);
  // แกล้งทำ disk พัง: ลบโฟลเดอร์แล้วเอาไฟล์มาขวาง path เดิม การ persist ครั้งถัดไปต้องล้ม
  // Break the disk: replace the directory with a file so the next persist fails.
  await rm(sub, { recursive: true, force: true });
  await writeFile(sub, "in the way");
  await assert.rejects(store2.create(input));
  // ซ่อม disk กลับ: เซฟครั้งต่อไปต้องสำเร็จ และข้อมูลบน disk ต้องครบ 3 กลุ่ม
  // Repair the disk: the next save must work again.
  await rm(sub, { force: true });
  const recovered = await store2.create(input);
  assert.ok(recovered.id);
  const onDisk = JSON.parse(await readFile(file, "utf8")) as unknown[];
  assert.equal(onDisk.length, 3);
});
