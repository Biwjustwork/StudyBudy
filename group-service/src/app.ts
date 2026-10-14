import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { GroupStore } from "./group-store.js";

type AuthenticatedRequest = Request & { userId?: string };

export function createApp(store: GroupStore, tokenSecret: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  app.get("/health", (_request, response) => response.json({ status: "ok", service: "group" }));

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

  app.post("/api/groups", async (request: AuthenticatedRequest, response: Response) => {
    const validated = validateGroupInput(request.body);
    if (!validated.ok) {
      return response.status(400).json({ error: "validation_error", message: validated.message });
    }
    const userId = request.userId as string;
    const group = await store.create({
      subject: validated.value.subject,
      topic: validated.value.topic,
      datetime: validated.value.datetime,
      maxMembers: validated.value.maxMembers,
      location: validated.value.location,
      ownerId: userId,
      members: [userId],
      isOpen: validated.value.isOpen,
    });
    return response.status(201).json(group);
  });

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
    groups.sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
    return response.json(groups);
  });

  app.get("/api/groups/:id", (request: AuthenticatedRequest, response: Response) => {
    const id = request.params["id"];
    const group = typeof id === "string" ? store.get(id) : undefined;
    if (!group) return response.status(404).json({ error: "not_found", message: "Group not found" });
    return response.json(group);
  });

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

  app.post("/api/groups/:id/members", async (request: AuthenticatedRequest, response: Response) => {
    const id = request.params["id"];
    const group = typeof id === "string" ? store.get(id) : undefined;
    if (!group) return response.status(404).json({ error: "not_found", message: "Group not found" });
    if (group.ownerId !== request.userId) {
      return response.status(403).json({ error: "forbidden", message: "Only the group owner can add members" });
    }
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
  datetime: string;
  maxMembers: number;
  location: string;
  isOpen: boolean;
};

function validateGroupInput(body: unknown): { ok: true; value: ValidatedGroupInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be an object" };
  }
  const input = body as Record<string, unknown>;
  for (const field of ["subject", "topic", "datetime", "location"] as const) {
    if (typeof input[field] !== "string" || (input[field] as string).trim().length === 0) {
      return { ok: false, message: `${field} must be a non-empty string` };
    }
  }
  const subject = (input["subject"] as string).trim();
  const topic = (input["topic"] as string).trim();
  const datetime = (input["datetime"] as string).trim();
  const location = (input["location"] as string).trim();
  const parsed = Date.parse(datetime);
  if (Number.isNaN(parsed)) {
    return { ok: false, message: "datetime must be a valid ISO 8601 date string" };
  }
  if (parsed <= Date.now()) {
    return { ok: false, message: "datetime must be in the future" };
  }
  if (!Number.isInteger(input["maxMembers"]) || (input["maxMembers"] as number) <= 0) {
    return { ok: false, message: "maxMembers must be a positive integer" };
  }
  let isOpen = true;
  if (input["isOpen"] !== undefined) {
    if (typeof input["isOpen"] !== "boolean") {
      return { ok: false, message: "isOpen must be a boolean" };
    }
    isOpen = input["isOpen"];
  }
  return { ok: true, value: { subject, topic, datetime, maxMembers: input["maxMembers"] as number, location, isOpen } };
}

type ValidatedGroupPatch = Partial<Pick<ValidatedGroupInput, "subject" | "topic" | "datetime" | "maxMembers" | "location" | "isOpen">>;

function validateGroupPatch(body: unknown, membersLength: number): { ok: true; value: ValidatedGroupPatch } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be an object" };
  }
  const input = body as Record<string, unknown>;
  const allowed = ["subject", "topic", "datetime", "location", "maxMembers", "isOpen"] as const;
  const present = allowed.filter((field) => input[field] !== undefined);
  if (present.length === 0) {
    return { ok: false, message: "At least one updatable field (subject, topic, datetime, location, maxMembers, isOpen) is required" };
  }
  const value: ValidatedGroupPatch = {};
  for (const field of ["subject", "topic", "datetime", "location"] as const) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== "string" || (input[field] as string).trim().length === 0) {
      return { ok: false, message: `${field} must be a non-empty string` };
    }
  }
  if (input["subject"] !== undefined) value.subject = (input["subject"] as string).trim();
  if (input["topic"] !== undefined) value.topic = (input["topic"] as string).trim();
  if (input["location"] !== undefined) value.location = (input["location"] as string).trim();
  if (input["datetime"] !== undefined) {
    const datetime = (input["datetime"] as string).trim();
    const parsed = Date.parse(datetime);
    if (Number.isNaN(parsed)) {
      return { ok: false, message: "datetime must be a valid ISO 8601 date string" };
    }
    if (parsed <= Date.now()) {
      return { ok: false, message: "datetime must be in the future" };
    }
    value.datetime = datetime;
  }
  if (input["maxMembers"] !== undefined) {
    if (!Number.isInteger(input["maxMembers"]) || (input["maxMembers"] as number) <= 0) {
      return { ok: false, message: "maxMembers must be a positive integer" };
    }
    if ((input["maxMembers"] as number) < membersLength) {
      return { ok: false, message: "maxMembers must not be less than the current number of members" };
    }
    value.maxMembers = input["maxMembers"] as number;
  }
  if (input["isOpen"] !== undefined) {
    if (typeof input["isOpen"] !== "boolean") {
      return { ok: false, message: "isOpen must be a boolean" };
    }
    value.isOpen = input["isOpen"];
  }
  return { ok: true, value };
}
