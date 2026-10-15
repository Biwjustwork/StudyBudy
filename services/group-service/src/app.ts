import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { GroupStore } from "./group-store.js";

type AuthenticatedRequest = Request & { userId?: string };

export function createApp(store: GroupStore, tokenSecret: string, serviceToken: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-service-token");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  // Health check: ตอบว่ายังมีชีวิตอยู่ ไม่ต้องใช้ token
  app.get("/health", (_request, response) => response.json({ status: "ok", service: "group" }));

  // กันที่นั่งให้ Membership (server-to-server): เช็กแค่ x-service-token ไม่ใช้ Bearer
  // วางไว้ก่อน Bearer middleware เพื่อให้ /internal ไม่โดนดักด้วย JWT
  app.post("/internal/groups/:id/members", async (request: Request, response: Response) => {
    if (request.header("x-service-token") !== serviceToken) {
      return response.status(401).json({ error: "unauthorized", message: "Service token is invalid" });
    }
    const id = request.params["id"];
    const group = typeof id === "string" ? store.get(id) : undefined;
    if (!group) return response.status(404).json({ error: "not_found", message: "Group not found" });
    const body = request.body as Record<string, unknown> | null | undefined;
    const userId = typeof body?.["userId"] === "string" ? (body["userId"] as string).trim() : "";
    if (userId.length === 0) {
      return response.status(400).json({ error: "validation_error", message: "userId must be a non-empty string" });
    }
    const result = await store.addMember(group.id, userId);
    if (!result.ok) {
      if (result.error === "not_found") return response.status(404).json({ error: "not_found", message: "Group not found" });
      if (result.error === "conflict") return response.status(409).json({ error: "conflict", message: "User is already a member of this group" });
      return response.status(422).json({ error: "capacity_exceeded", message: result.error === "closed" ? "Group is closed for new members" : "Group is full" });
    }
    return response.json(result.value);
  });

  app.delete("/internal/groups/:id/members", async (request: Request, response: Response) => {
    if (request.header("x-service-token") !== serviceToken) {
      return response.status(401).json({ error: "unauthorized", message: "Service token is invalid" });
    }
    const id = request.params["id"];
    const userId = typeof request.body?.["userId"] === "string" ? request.body["userId"].trim() : "";
    if (!userId) return response.status(400).json({ error: "validation_error", message: "userId must be a non-empty string" });
    const result = await store.removeMember(typeof id === "string" ? id : "", userId);
    if (result === "not_found") return response.status(404).json({ error: "not_found", message: "Group not found" });
    if (result === "not_member") return response.status(404).json({ error: "not_found", message: "User is not a member of this group" });
    if (result === "owner") return response.status(409).json({ error: "conflict", message: "Group owner cannot leave the group" });
    return response.sendStatus(204);
  });

  app.delete("/internal/groups/:id", async (request: Request, response: Response) => {
    if (request.header("x-service-token") !== serviceToken) {
      return response.status(401).json({ error: "unauthorized", message: "Service token is invalid" });
    }
    const id = request.params["id"];
    const group = typeof id === "string" ? store.get(id) : undefined;
    if (!group) return response.status(404).json({ error: "not_found", message: "Group not found" });
    const result = await store.deleteIfOwnerAlone(group.id);
    if (result === "not_found") return response.status(404).json({ error: "not_found", message: "Group not found" });
    if (result === "not_empty") {
      return response.status(409).json({ error: "conflict", message: "Groups with other members cannot be deleted" });
    }
    return response.sendStatus(204);
  });

  // ด่านตรวจ JWT: ทุก route /api/* ข้างล่างต้องผ่านตรงนี้ก่อน (ต้องมี userId ใน token)
  app.use((request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) return response.status(401).json({ error: "unauthorized", message: "Bearer token is required" });
    try {
      const payload = jwt.verify(match[1], tokenSecret, { algorithms: ["HS256"] }) as JwtPayload;
      if (typeof payload.userId !== "string" || payload.userId.length === 0) {
        return response.status(401).json({ error: "unauthorized", message: "Token does not contain a userId" });
      }
      request.userId = payload.userId;
      next();
    } catch {
      return response.status(401).json({ error: "unauthorized", message: "Token is invalid or expired" });
    }
  });

  // สร้างกลุ่ม: เอา ownerId/members จาก token ห้ามเชื่อค่าจาก body
  app.post("/api/groups", async (request: AuthenticatedRequest, response: Response) => {
    const validated = validateGroupInput(request.body);
    if (!validated.ok) {
      return response.status(400).json({ error: "validation_error", message: validated.message });
    }
    const userId = request.userId as string;
    const group = await store.create({
      subject: validated.value.subject,
      topic: validated.value.topic,
      startsAt: validated.value.startsAt,
      maxMembers: validated.value.maxMembers,
      location: validated.value.location,
      ownerId: userId,
      members: [userId],
      isOpen: validated.value.isOpen,
    });
    return response.status(201).json(group);
  });

  // ค้นหากลุ่ม: subject เทียบแบบไม่สนตัวพิมพ์ (trim ก่อน) ว่าง = เอาทั้งหมด
  // openOnly=true เก็บเฉพาะกลุ่มที่เปิดและที่นั่งยังไม่เต็ม แล้วเรียงตาม startsAt ใกล้ไปไกล
  app.get("/api/groups", (request: AuthenticatedRequest, response: Response) => {
    const subjectQuery = typeof request.query["subject"] === "string" ? request.query["subject"].trim().toLocaleLowerCase() : "";
    const openOnly = request.query["openOnly"] === "true";
    let groups = store.list();
    if (subjectQuery.length > 0) {
      groups = groups.filter((group) => group.subject.trim().toLocaleLowerCase() === subjectQuery);
    }
    if (openOnly) {
      groups = groups.filter((group) => group.isOpen && group.members.length < group.maxMembers);
    }
    groups.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return response.json(groups);
  });

  // อ่านกลุ่มใบเดียว: ไม่มี id นี้ตอบ 404
  app.get("/api/groups/:id", (request: AuthenticatedRequest, response: Response) => {
    const id = request.params["id"];
    const group = typeof id === "string" ? store.get(id) : undefined;
    if (!group) return response.status(404).json({ error: "not_found", message: "Group not found" });
    return response.json(group);
  });

  // แก้กลุ่ม: เฉพาะเจ้าของกลุ่ม (403 ถ้าไม่ใช่) แตะได้แค่ 6 ฟิลด์ที่ validate แล้ว
  app.patch("/api/groups/:id", async (request: AuthenticatedRequest, response: Response) => {
    const id = request.params["id"];
    const group = typeof id === "string" ? store.get(id) : undefined;
    if (!group) return response.status(404).json({ error: "not_found", message: "Group not found" });
    if (group.ownerId !== request.userId) {
      return response.status(403).json({ error: "forbidden", message: "Only the group owner can update this group" });
    }
    const validated = validateGroupPatch(request.body, group.members.length);
    if (!validated.ok) {
      return response.status(400).json({ error: "validation_error", message: validated.message });
    }
    const updated = await store.update(group.id, validated.value);
    return response.json(updated);
  });

  // ดัก body ที่ไม่ใช่ JSON ถูก format: ตอบ 400 แทน 500
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "validation_error", message: "Request body must be valid JSON" });
    console.error(error);
    return response.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
  });
  return app;
}

type ValidatedGroupInput = {
  subject: string;
  topic: string;
  startsAt: string;
  maxMembers: number;
  location: string;
  isOpen: boolean;
};

function reqString(input: Record<string, unknown>, field: string): { ok: true; value: string } | { ok: false; message: string } {
  const raw = input[field];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, message: `${field} must be a non-empty string` };
  }
  return { ok: true, value: raw.trim() };
}

// ตรวจวันเวลานัด: ต้องเป็น ISO 8601 มี timezone ต่อท้าย (Z หรือ ±hh:mm) และเป็นอนาคต
function reqFutureDatetime(input: Record<string, unknown>, field: string): { ok: true; value: string } | { ok: false; message: string } {
  const parsed = reqString(input, field);
  if (!parsed.ok) return parsed;
  const time = Date.parse(parsed.value);
  if (Number.isNaN(time)) {
    return { ok: false, message: "startsAt must be a valid ISO 8601 date string" };
  }
  if (time <= Date.now()) {
    return { ok: false, message: "startsAt must be in the future" };
  }
  if (!/([Zz]|[+-]\d{2}:?\d{2})$/.test(parsed.value)) {
    return { ok: false, message: "startsAt must be a valid ISO 8601 date string" };
  }
  return { ok: true, value: parsed.value };
}

// ตรวจ maxMembers: ต้องเป็นจำนวนเต็มบวก และตอน PATCH ห้ามลดต่ำกว่าจำนวนสมาชิกปัจจุบัน
function reqMaxMembers(input: Record<string, unknown>, field: string, min: number | null): { ok: true; value: number } | { ok: false; message: string } {
  const raw = input[field];
  if (!Number.isInteger(raw) || (raw as number) <= 0) {
    return { ok: false, message: "maxMembers must be a positive integer" };
  }
  if (min !== null && (raw as number) < min) {
    return { ok: false, message: "maxMembers must not be less than the current number of members" };
  }
  return { ok: true, value: raw as number };
}

function optIsOpen(input: Record<string, unknown>): { ok: true; value: boolean } | { ok: false; message: string } {
  if (input["isOpen"] === undefined) return { ok: true, value: true };
  if (typeof input["isOpen"] !== "boolean") {
    return { ok: false, message: "isOpen must be a boolean" };
  }
  return { ok: true, value: input["isOpen"] };
}

// ตรวจ body ตอนสร้างกลุ่ม: subject/topic/location ห้ามว่างหลัง trim + เช็กวันเวลา + ที่นั่ง + isOpen
function validateGroupInput(body: unknown): { ok: true; value: ValidatedGroupInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be an object" };
  }
  const input = body as Record<string, unknown>;
  for (const field of ["subject", "topic", "location"] as const) {
    const parsed = reqString(input, field);
    if (!parsed.ok) return parsed;
  }
  const startsAt = reqFutureDatetime(input, "startsAt");
  if (!startsAt.ok) return startsAt;
  const maxMembers = reqMaxMembers(input, "maxMembers", null);
  if (!maxMembers.ok) return maxMembers;
  const isOpen = optIsOpen(input);
  if (!isOpen.ok) return isOpen;
  return {
    ok: true,
    value: {
      subject: (input["subject"] as string).trim(),
      topic: (input["topic"] as string).trim(),
      startsAt: startsAt.value,
      maxMembers: maxMembers.value,
      location: (input["location"] as string).trim(),
      isOpen: isOpen.value,
    },
  };
}

type ValidatedGroupPatch = Partial<Pick<ValidatedGroupInput, "subject" | "topic" | "startsAt" | "maxMembers" | "location" | "isOpen">>;

// ตรวจ body ตอน PATCH: ต้องมีฟิลด์ที่แก้ได้อย่างน้อย 1 ตัว ฟิลด์นอกเหนือ (id/ownerId/members) จะถูกเมิน
function validateGroupPatch(body: unknown, membersLength: number): { ok: true; value: ValidatedGroupPatch } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be an object" };
  }
  const input = body as Record<string, unknown>;
  const allowed = ["subject", "topic", "startsAt", "location", "maxMembers", "isOpen"] as const;
  const present = allowed.filter((field) => input[field] !== undefined);
  if (present.length === 0) {
    return { ok: false, message: "At least one updatable field (subject, topic, startsAt, location, maxMembers, isOpen) is required" };
  }
  const value: ValidatedGroupPatch = {};
  for (const field of ["subject", "topic", "location"] as const) {
    if (input[field] === undefined) continue;
    const parsed = reqString(input, field);
    if (!parsed.ok) return parsed;
    value[field] = parsed.value;
  }
  if (input["startsAt"] !== undefined) {
    const startsAt = reqFutureDatetime(input, "startsAt");
    if (!startsAt.ok) return startsAt;
    value.startsAt = startsAt.value;
  }
  if (input["maxMembers"] !== undefined) {
    const maxMembers = reqMaxMembers(input, "maxMembers", membersLength);
    if (!maxMembers.ok) return maxMembers;
    value.maxMembers = maxMembers.value;
  }
  if (input["isOpen"] !== undefined) {
    if (typeof input["isOpen"] !== "boolean") {
      return { ok: false, message: "isOpen must be a boolean" };
    }
    value.isOpen = input["isOpen"];
  }
  return { ok: true, value };
}
