import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { type GroupClient, GroupServiceError } from "./group-client.js";
import { type MembershipRequest, RequestStore } from "./request-store.js";

type AuthenticatedRequest = Request & { userId?: string; bearerToken?: string };

export function createApp(store: RequestStore, tokenSecret: string, groupClient: GroupClient) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  app.get("/health", (_request, response) => response.json({ status: "ok", service: "membership" }));

  app.use("/api", (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) return response.status(401).json({ error: "unauthorized", message: "Bearer token is required" });
    try {
      const payload = jwt.verify(match[1], tokenSecret, { algorithms: ["HS256"] }) as JwtPayload;
      if (typeof payload.userId !== "string" || payload.userId.length === 0) {
        return response.status(401).json({ error: "unauthorized", message: "Token does not contain a userId" });
      }
      request.userId = payload.userId;
      request.bearerToken = match[1];
      next();
    } catch {
      return response.status(401).json({ error: "unauthorized", message: "Token is invalid or expired" });
    }
  });

  app.post("/api/requests", async (request: AuthenticatedRequest, response: Response) => {
    const body = request.body as Record<string, unknown> | null | undefined;
    const groupId = typeof body?.["groupId"] === "string" ? body["groupId"].trim() : "";
    if (groupId.length === 0) {
      return response.status(400).json({ error: "validation_error", message: "groupId must be a non-empty string" });
    }
    if (store.find(groupId, request.userId as string)) {
      return response.status(409).json({ error: "conflict", message: "A request already exists for this user and group" });
    }
    try {
      const group = await groupClient.getGroup(groupId, request.bearerToken as string);
      if (group.ownerId === request.userId || group.members.includes(request.userId as string)) {
        return response.status(409).json({ error: "conflict", message: "User is already a group member or owner" });
      }
      if (!group.isOpen || group.members.length >= group.maxMembers) {
        return response.status(422).json({ error: "capacity_exceeded", message: "Group is full or closed for new members" });
      }
      const created = await store.create(groupId, request.userId as string);
      if (!created) {
        return response.status(409).json({ error: "conflict", message: "A request already exists for this user and group" });
      }
      return response.status(201).json(created);
    } catch (error) {
      return sendGroupError(response, error);
    }
  });

  app.get("/api/requests", async (request: AuthenticatedRequest, response: Response) => {
    const groupId = typeof request.query["groupId"] === "string" ? request.query["groupId"].trim() : "";
    if (groupId.length === 0) {
      return response.status(400).json({ error: "validation_error", message: "groupId query is required" });
    }
    try {
      const group = await groupClient.getGroup(groupId, request.bearerToken as string);
      if (group.ownerId !== request.userId) {
        return response.status(403).json({ error: "forbidden", message: "Only the group owner can view requests" });
      }
      return response.json(store.listByGroup(groupId));
    } catch (error) {
      return sendGroupError(response, error);
    }
  });

  app.post("/api/requests/:id/approve", async (request: AuthenticatedRequest, response: Response) => {
    return decideRequest(request, response, "approved", store, groupClient);
  });

  app.post("/api/requests/:id/reject", async (request: AuthenticatedRequest, response: Response) => {
    return decideRequest(request, response, "rejected", store, groupClient);
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError) {
      return response.status(400).json({ error: "validation_error", message: "Request body must be valid JSON" });
    }
    console.error(error);
    return response.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
  });
  return app;
}

async function decideRequest(
  request: AuthenticatedRequest,
  response: Response,
  status: Exclude<MembershipRequest["status"], "pending">,
  store: RequestStore,
  groupClient: GroupClient,
) {
  const id = request.params["id"];
  const membershipRequest = typeof id === "string" ? store.get(id) : undefined;
  if (!membershipRequest) return response.status(404).json({ error: "not_found", message: "Request not found" });
  try {
    const group = await groupClient.getGroup(membershipRequest.groupId, request.bearerToken as string);
    if (group.ownerId !== request.userId) {
      return response.status(403).json({ error: "forbidden", message: "Only the group owner can decide requests" });
    }
    if (!store.beginDecision(membershipRequest.id)) {
      return response.status(409).json({ error: "conflict", message: "Request has already been decided or is being processed" });
    }
    try {
      if (status === "approved") {
        await groupClient.addMember(membershipRequest.groupId, membershipRequest.requesterId, request.bearerToken as string);
      }
      const decided = await store.decide(membershipRequest.id, status, request.userId as string);
      // TODO(member 5): Dispatch this saved notification event once Notification Service is available.
      return response.json(decided);
    } catch (error) {
      return sendGroupError(response, error);
    } finally {
      store.endDecision(membershipRequest.id);
    }
  } catch (error) {
    return sendGroupError(response, error);
  }
}

function sendGroupError(response: Response, error: unknown) {
  if (!(error instanceof GroupServiceError)) throw error;
  const errorCode = error.status === 404
    ? "not_found"
    : error.status === 403
      ? "forbidden"
      : error.status === 409
        ? "conflict"
        : error.status === 422
          ? "capacity_exceeded"
          : error.status === 401
            ? "unauthorized"
            : error.status === 400
              ? "validation_error"
              : "dependency_unavailable";
  return response.status(error.status).json({ error: errorCode, message: error.message });
}
