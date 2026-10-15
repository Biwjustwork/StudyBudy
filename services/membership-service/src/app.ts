import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { type GroupClient, GroupServiceError } from "./group-client.js";
import { deliverNotification } from "./notification-delivery.js";
import { type NotificationClient } from "./notification-client.js";
import { type ProfileClient, ProfileServiceError } from "./profile-client.js";
import { type MembershipRequest, RequestStore } from "./request-store.js";

type AuthenticatedRequest = Request & { userId?: string; bearerToken?: string };

export function createApp(
  store: RequestStore,
  tokenSecret: string,
  groupClient: GroupClient,
  notificationClient: NotificationClient,
  profileClient: ProfileClient = { getProfiles: async () => [], getDisplayNames: async () => [] },
) {
  if (tokenSecret.trim().length < 32) throw new Error("AUTH_TOKEN_SECRET must be at least 32 characters long");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (request.method === "OPTIONS") return response.sendStatus(204);
    next();
  });

  app.get("/health", (_request, response) => response.json({ status: "ok", service: "membership" }));

  app.use("/api", (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match) return response.status(401).json({ error: "unauthorized", message: "Bearer token is required" });
    try {
      const payload = jwt.verify(match[1], tokenSecret, { algorithms: ["HS256"] }) as JwtPayload;
      if (typeof payload.userId !== "string" || payload.userId.trim().length === 0
        || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)
        || payload.exp <= Math.floor(Date.now() / 1000)) {
        return response.status(401).json({ error: "unauthorized", message: "Token must contain a valid userId and exp" });
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
    if (!store.beginGroupOperation(groupId)) {
      return response.status(409).json({ error: "conflict", message: "This group is being changed; try again" });
    }
    try {
      if (store.find(groupId, request.userId as string)) {
        return response.status(409).json({ error: "conflict", message: "A request already exists for this user and group" });
      }
      const group = await groupClient.getGroup(groupId, request.bearerToken as string);
      if (group.ownerId === request.userId || group.members.includes(request.userId as string)) {
        return response.status(409).json({ error: "conflict", message: "User is already a group member or owner" });
      }
      if (!group.isOpen || group.members.length >= group.maxMembers) {
        return response.status(422).json({ error: "capacity_exceeded", message: "Group is full or closed for new members" });
      }
      let requesterName = "สมาชิกใหม่";
      try {
        const [profile] = await profileClient.getProfiles([request.userId as string]);
        if (profile?.name.trim()) requesterName = profile.name.trim();
      } catch {
        // A profile lookup must not prevent a valid membership request.
      }
      const groupLabel = [group.subject, group.topic].filter((value) => value?.trim()).join(" · ")
        || "กลุ่มอ่านหนังสือ";
      const notificationEvent = {
        userId: group.ownerId,
        type: "request_received" as const,
        message: `มีคำขอเข้าร่วมกลุ่ม “${groupLabel}” จาก ${requesterName}`,
        groupId,
      };
      const created = await store.create(groupId, request.userId as string, notificationEvent);
      if (!created) {
        return response.status(409).json({ error: "conflict", message: "A request already exists for this user and group" });
      }
      const delivered = await deliverNotification(store, notificationClient, created);
      return response.status(201).json(publicRequest(delivered));
    } catch (error) {
      return sendGroupError(response, error);
    } finally {
      store.endGroupOperation(groupId);
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
      const requests = store.listByGroup(groupId);
      const profiles = await profileClient.getProfiles(requests.map((item) => item.requesterId));
      const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
      return response.json(requests.map((item) => {
        const profile = profilesById.get(item.requesterId);
        return {
          ...publicRequest(item),
          requesterName: profile?.name ?? "ไม่พบข้อมูลชื่อผู้ขอ",
          requesterEmail: profile?.email ?? "ไม่พบอีเมล",
        };
      }));
    } catch (error) {
      if (error instanceof ProfileServiceError) {
        return response.status(error.status).json({ error: "dependency_unavailable", message: "Profile Service is unavailable" });
      }
      return sendGroupError(response, error);
    }
  });

  app.get("/api/groups/:id/members", async (request: AuthenticatedRequest, response: Response) => {
    const groupId = request.params["id"];
    if (typeof groupId !== "string") {
      return response.status(400).json({ error: "validation_error", message: "groupId must be a string" });
    }
    try {
      const group = await groupClient.getGroup(groupId, request.bearerToken as string);
      const profiles = await profileClient.getDisplayNames(group.members);
      const namesById = new Map(profiles.map((profile) => [profile.id, profile.name]));
      return response.json(group.members.map((id) => ({
        name: namesById.get(id) ?? "สมาชิก Study Buddy",
        isOwner: id === group.ownerId,
      })));
    } catch (error) {
      if (error instanceof ProfileServiceError) {
        return response.status(error.status).json({ error: "dependency_unavailable", message: "Profile Service is unavailable" });
      }
      return sendGroupError(response, error);
    }
  });

  app.delete("/api/groups/:id", async (request: AuthenticatedRequest, response: Response) => {
    const groupId = request.params["id"];
    if (typeof groupId !== "string" || !store.beginGroupOperation(groupId)) {
      return response.status(409).json({ error: "conflict", message: "This group is already being changed" });
    }
    try {
      const group = await groupClient.getGroup(groupId, request.bearerToken as string);
      if (group.ownerId !== request.userId) {
        return response.status(403).json({ error: "forbidden", message: "Only the group owner can delete this group" });
      }
      if (group.members.length !== 1 || group.members[0] !== group.ownerId) {
        return response.status(409).json({ error: "conflict", message: "Groups with other members cannot be deleted" });
      }
      if (store.listByGroup(groupId).some((item) => item.status === "pending")) {
        return response.status(409).json({ error: "conflict", message: "Groups with pending membership requests cannot be deleted" });
      }
      await groupClient.deleteGroup(groupId);
      return response.sendStatus(204);
    } catch (error) {
      return sendGroupError(response, error);
    } finally {
      store.endGroupOperation(groupId);
    }
  });

  app.delete("/api/groups/:id/leave", async (request: AuthenticatedRequest, response: Response) => {
    const groupId = request.params["id"];
    if (typeof groupId !== "string" || !store.beginGroupOperation(groupId)) {
      return response.status(409).json({ error: "conflict", message: "This group is already being changed" });
    }
    try {
      const group = await groupClient.getGroup(groupId, request.bearerToken as string);
      const userId = request.userId as string;
      if (group.ownerId === userId) {
        return response.status(409).json({ error: "conflict", message: "Group owner cannot leave the group; delete it instead" });
      }
      if (!group.members.includes(userId)) {
        return response.status(409).json({ error: "conflict", message: "You are not a member of this group" });
      }
      await groupClient.removeMember(groupId, userId);
      return response.sendStatus(204);
    } catch (error) {
      return sendGroupError(response, error);
    } finally {
      store.endGroupOperation(groupId);
    }
  });

  app.delete("/api/groups/:id/members/:memberId", async (request: AuthenticatedRequest, response: Response) => {
    const groupId = request.params["id"];
    const memberId = request.params["memberId"];
    if (typeof groupId !== "string" || typeof memberId !== "string" || !store.beginGroupOperation(groupId)) {
      return response.status(409).json({ error: "conflict", message: "This group is already being changed" });
    }
    try {
      const group = await groupClient.getGroup(groupId, request.bearerToken as string);
      if (group.ownerId !== request.userId) {
        return response.status(403).json({ error: "forbidden", message: "Only the group owner can remove members" });
      }
      if (memberId === group.ownerId) {
        return response.status(409).json({ error: "conflict", message: "The group owner cannot be removed" });
      }
      if (!group.members.includes(memberId)) {
        return response.status(404).json({ error: "not_found", message: "Member not found in this group" });
      }
      await groupClient.removeMember(groupId, memberId);
      return response.sendStatus(204);
    } catch (error) {
      return sendGroupError(response, error);
    } finally {
      store.endGroupOperation(groupId);
    }
  });

  app.post("/api/requests/:id/approve", async (request: AuthenticatedRequest, response: Response) => {
    return decideRequest(request, response, "approved", store, groupClient, notificationClient);
  });

  app.post("/api/requests/:id/reject", async (request: AuthenticatedRequest, response: Response) => {
    return decideRequest(request, response, "rejected", store, groupClient, notificationClient);
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
  notificationClient: NotificationClient,
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
        await reserveGroupSeat(store, groupClient, membershipRequest, request.bearerToken as string);
      } else {
        await ensureRejectionHasNoReservedSeat(store, groupClient, membershipRequest, request.bearerToken as string);
      }
      const decided = await store.decide(membershipRequest.id, status, request.userId as string);
      return response.json(publicRequest(await deliverNotification(store, notificationClient, decided)));
    } catch (error) {
      if (error instanceof GroupServiceError) return sendGroupError(response, error);
      throw error;
    } finally {
      store.endDecision(membershipRequest.id);
    }
  } catch (error) {
    return sendGroupError(response, error);
  }
}

function publicRequest(request: MembershipRequest) {
  const {
    approvalState: _approvalState,
    notificationEvent: _notificationEvent,
    ...publicRecord
  } = request;
  return publicRecord;
}

async function reserveGroupSeat(
  store: RequestStore,
  groupClient: GroupClient,
  membershipRequest: MembershipRequest,
  bearerToken: string,
): Promise<void> {
  let current = store.get(membershipRequest.id);
  if (!current) throw new Error("Membership request disappeared during approval");
  if (current.approvalState === "reserved") return;

  if (current.approvalState === "reserving") {
    const group = await groupClient.getGroup(current.groupId, bearerToken);
    if (group.members.includes(current.requesterId)) {
      await store.setApprovalState(current.id, "reserved");
      return;
    }
  } else {
    current = await store.setApprovalState(current.id, "reserving");
  }

  try {
    await groupClient.addMember(current.groupId, current.requesterId);
  } catch (error) {
    if (error instanceof GroupServiceError && error.status === 409) {
      const group = await groupClient.getGroup(current.groupId, bearerToken);
      if (group.members.includes(current.requesterId)) {
        await store.setApprovalState(current.id, "reserved");
        return;
      }
    }
    if (error instanceof GroupServiceError && error.status === 422) {
      await store.setApprovalState(current.id, undefined);
    }
    throw error;
  }
  await store.setApprovalState(current.id, "reserved");
}

async function ensureRejectionHasNoReservedSeat(
  store: RequestStore,
  groupClient: GroupClient,
  membershipRequest: MembershipRequest,
  bearerToken: string,
): Promise<void> {
  if (!membershipRequest.approvalState) return;
  const group = await groupClient.getGroup(membershipRequest.groupId, bearerToken);
  if (group.members.includes(membershipRequest.requesterId)) {
    if (membershipRequest.approvalState !== "reserved") {
      await store.setApprovalState(membershipRequest.id, "reserved");
    }
    throw new GroupServiceError(409, "A seat has already been reserved for this request");
  }
  if (membershipRequest.approvalState === "reserved") {
    throw new GroupServiceError(409, "Saved seat reservation does not match Group Service");
  }
  await store.setApprovalState(membershipRequest.id, undefined);
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
