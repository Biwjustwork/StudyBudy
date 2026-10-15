import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { NotificationConflictError, type NotificationEvent, type NotificationStore } from "./notification-store.js";

type AuthenticatedRequest = Request & { userId?: string };

export function createApp(store: NotificationStore, tokenSecret: string, serviceToken: string) {
  if (!tokenSecret.trim() || !serviceToken.trim()) throw new Error("Auth and notification service secrets must be set");
  const app = express();
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Service-Token");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", (_request, response) => response.json({ status: "ok", service: "notification" }));
  app.get("/", (_request, response) => response.redirect("/notifications.html"));
  app.use(express.static(fileURLToPath(new URL("../public/", import.meta.url)), { index: false, dotfiles: "deny" }));

  // Internal events come only from Membership, never from a user's Bearer token.
  app.post("/internal/notifications", async (request, response) => {
    if (request.header("X-Service-Token") !== serviceToken) {
      return response.status(401).json({ error: "unauthorized", message: "Service token is invalid" });
    }
    const event = validateEvent(request.body);
    if (!event) return response.status(400).json({ error: "validation_error", message: "userId, type, message and relatedId must be valid non-empty strings" });
    try {
      const result = await store.create(event);
      return response.status(result.created ? 201 : 200).json(result.notification);
    } catch (error) {
      if (error instanceof NotificationConflictError) {
        return response.status(409).json({ error: "conflict", message: "This event already exists with a different message" });
      }
      throw error;
    }
  });

  app.use("/api", (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const match = request.header("Authorization")?.match(/^Bearer\s+(\S+)$/i);
    if (match) {
      try {
        const payload = jwt.verify(match[1], tokenSecret, { algorithms: ["HS256"] });
        if (typeof payload === "object" && typeof payload.userId === "string"
          && payload.userId.trim().length > 0 && Number.isFinite(payload.exp)) {
          request.userId = payload.userId;
          return next();
        }
      } catch { /* Use the same response for all invalid tokens. */ }
    }
    return response.status(401).json({ error: "unauthorized", message: "A valid Bearer token with userId and exp is required" });
  });

  app.get("/api/notifications", (request: AuthenticatedRequest, response) => {
    response.setHeader("Cache-Control", "no-store");
    const rawLimit = request.query.limit;
    const rawOffset = request.query.offset;
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    const offset = rawOffset === undefined ? 0 : Number(rawOffset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100
      || !Number.isInteger(offset) || offset < 0) {
      return response.status(400).json({ error: "validation_error", message: "limit must be 1–100 and offset must be a non-negative integer" });
    }
    return response.json(store.list(request.userId as string, offset, limit));
  });

  app.patch("/api/notifications/:id/read", async (request: AuthenticatedRequest, response) => {
    const id = request.params["id"];
    const result = await store.markRead(typeof id === "string" ? id : "", request.userId as string);
    if (result.status === "not_found") return response.status(404).json({ error: "not_found", message: "Notification not found" });
    if (result.status === "forbidden") return response.status(403).json({ error: "forbidden", message: "You can only mark your own notifications as read" });
    return response.json(result.notification);
  });

  app.use((_request, response) => response.status(404).json({ error: "not_found", message: "Endpoint not found" }));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const type = error && typeof error === "object" && "type" in error ? error.type : undefined;
    if (type === "entity.parse.failed") return response.status(400).json({ error: "validation_error", message: "Request body must be valid JSON" });
    if (type === "entity.too.large") return response.status(413).json({ error: "request_too_large", message: "Request body is too large" });
    return response.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
  });
  return app;
}

function validateEvent(input: unknown): NotificationEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  for (const field of ["userId", "type", "message", "relatedId"]) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) return null;
  }
  const type = (body.type as string).trim();
  if (type !== "request_received" && type !== "request_approved" && type !== "request_rejected") return null;
  const groupId = body.groupId;
  if (type === "request_received" && (typeof groupId !== "string" || !groupId.trim())) return null;
  const message = (body.message as string).trim();
  if (message.length > 2000) return null;
  return {
    userId: (body.userId as string).trim(), type, message, relatedId: (body.relatedId as string).trim(),
    ...(typeof groupId === "string" ? { groupId: groupId.trim() } : {}),
  };
}
