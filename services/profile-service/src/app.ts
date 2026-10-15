import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { ProfileStore } from "./profile-store.js";

type AuthenticatedRequest = Request & { userId?: string };

export function createApp(store: ProfileStore, tokenSecret: string, profileServiceToken: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Service-Token");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  app.get("/health", (_request, response) => response.json({ status: "ok", service: "profile" }));

  app.post("/internal/users", async (request, response) => {
    if (request.header("x-service-token") !== profileServiceToken) {
      return response.status(401).json({ error: "unauthorized", message: "Service token is missing or invalid" });
    }
    const { id, name, email } = request.body ?? {};
    if ([id, name, email].some((value) => typeof value !== "string" || value.trim().length === 0)
      || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return response.status(400).json({ error: "validation_error", message: "id and name must be non-empty strings and email must be valid" });
    }
    const result = await store.createFromAuth({ id: id.trim(), name: name.trim(), email: email.trim() });
    if (result.status === "conflict") {
      return response.status(409).json({ error: "conflict", message: "Profile already exists with different name or email" });
    }
    return response.status(result.status === "created" ? 201 : 200).json(result.profile);
  });

  app.post("/internal/users/lookup", (request, response) => {
    if (request.header("x-service-token") !== profileServiceToken) {
      return response.status(401).json({ error: "unauthorized", message: "Service token is missing or invalid" });
    }
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || ids.length > 500
      || ids.some((id: unknown) => typeof id !== "string" || id.trim().length === 0)) {
      return response.status(400).json({ error: "validation_error", message: "ids must be an array of at most 500 non-empty strings" });
    }
    const profiles = [...new Set((ids as string[]).map((id) => id.trim()))]
      .flatMap((id) => {
        const profile = store.get(id);
        return profile ? [{ id: profile.id, name: profile.name, email: profile.email }] : [];
      });
    return response.json(profiles);
  });

  app.post("/internal/users/display-names", (request, response) => {
    if (request.header("x-service-token") !== profileServiceToken) {
      return response.status(401).json({ error: "unauthorized", message: "Service token is missing or invalid" });
    }
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || ids.length > 500
      || ids.some((id: unknown) => typeof id !== "string" || id.trim().length === 0)) {
      return response.status(400).json({ error: "validation_error", message: "ids must be an array of at most 500 non-empty strings" });
    }
    const profiles = [...new Set((ids as string[]).map((id) => id.trim()))]
      .flatMap((id) => {
        const profile = store.get(id);
        return profile ? [{ id: profile.id, name: profile.name }] : [];
      });
    return response.json(profiles);
  });

  app.use("/api", (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) return response.status(401).json({ error: "unauthorized", message: "Bearer token is required" });
    try {
      const payload = jwt.verify(match[1], tokenSecret, { algorithms: ["HS256"] }) as JwtPayload;
      if (typeof payload.userId !== "string" || payload.userId.trim().length === 0
        || typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
        return response.status(401).json({ error: "unauthorized", message: "Token must contain a non-empty userId and an unexpired exp" });
      }
      request.userId = payload.userId;
      next();
    } catch {
      return response.status(401).json({ error: "unauthorized", message: "Token is invalid or expired" });
    }
  });

  app.get("/api/users/search", (request, response) => {
    const subject = typeof request.query.subject === "string" ? request.query.subject.trim() : "";
    if (!subject) return response.status(400).json({ error: "validation_error", message: "subject query is required" });
    const profiles = store.findBySubject(subject).map(({ id, name, subjects }) => ({ id, name, subjects }));
    return response.json(profiles);
  });

  app.get("/api/users/:id", (request: AuthenticatedRequest, response) => {
    if (request.params.id !== request.userId) {
      return response.status(403).json({ error: "forbidden", message: "You can only view your own profile" });
    }
    const profile = store.get(request.params.id);
    if (!profile) return response.status(404).json({ error: "not_found", message: "User not found" });
    return response.json(profile);
  });

  app.put("/api/users/:id", async (request: AuthenticatedRequest, response) => {
    if (request.params.id !== request.userId) {
      return response.status(403).json({ error: "forbidden", message: "You can only update your own profile" });
    }
    const subjects = validateSubjects(request.body?.subjects);
    if (!subjects.ok) return response.status(400).json({ error: "validation_error", message: subjects.message });
    const profile = await store.setSubjects(request.params.id, subjects.value);
    if (!profile) return response.status(404).json({ error: "not_found", message: "User not found" });
    return response.json(profile);
  });

  app.use((_request, response) => {
    return response.status(404).json({ error: "not_found", message: "Route not found" });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "validation_error", message: "Request body must be valid JSON" });
    console.error(error);
    return response.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
  });
  return app;
}

function validateSubjects(input: unknown): { ok: true; value: string[] } | { ok: false; message: string } {
  if (!Array.isArray(input) || input.some((subject) => typeof subject !== "string" || subject.trim().length === 0)) {
    return { ok: false, message: "subjects must be an array of non-empty strings" };
  }
  const value = input.map((subject: string) => subject.trim());
  const normalized = value.map((subject) => subject.toLocaleLowerCase());
  if (new Set(normalized).size !== value.length) {
    return { ok: false, message: "subjects must not contain duplicates" };
  }
  return { ok: true, value };
}
