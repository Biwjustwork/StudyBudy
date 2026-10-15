import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type NotificationEvent } from "./notification-client.js";

export type RequestStatus = "pending" | "approved" | "rejected";

export type ApprovalState = "reserving" | "reserved";

export type MembershipRequest = {
  id: string;
  groupId: string;
  requesterId: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  approvalState?: ApprovalState;
  notificationEvent?: NotificationEvent;
  notificationStatus?: "pending" | "sent";
  notificationLastError?: string;
};

export type PersistMembershipRecords = (
  filePath: string,
  records: MembershipRequest[],
) => Promise<void>;

export class RequestStore {
  private requests = new Map<string, MembershipRequest>();
  private decisionLocks = new Set<string>();
  private notificationLocks = new Set<string>();
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly filePath: string,
    private readonly persistRecords: PersistMembershipRecords,
  ) {}

  static async open(
    filePath: string,
    persistRecords: PersistMembershipRecords = persistMembershipRecords,
  ): Promise<RequestStore> {
    const store = new RequestStore(filePath, persistRecords);
    try {
      const data: unknown = JSON.parse(await readFile(filePath, "utf8"));
      if (!Array.isArray(data)) throw new Error("Membership data must be a JSON array");
      for (const item of data) {
        if (!isMembershipRequest(item)) throw new Error("Membership data contains an invalid record");
        store.requests.set(item.id, item);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await store.persist();
    }
    return store;
  }

  get(id: string): MembershipRequest | undefined {
    const request = this.requests.get(id);
    return request ? structuredClone(request) : undefined;
  }

  find(groupId: string, requesterId: string): MembershipRequest | undefined {
    const request = [...this.requests.values()].find(
      (item) => item.groupId === groupId && item.requesterId === requesterId,
    );
    return request ? structuredClone(request) : undefined;
  }

  listByGroup(groupId: string): MembershipRequest[] {
    return [...this.requests.values()]
      .filter((request) => request.groupId === groupId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((request) => structuredClone(request));
  }

  async create(groupId: string, requesterId: string): Promise<MembershipRequest | undefined> {
    if (this.find(groupId, requesterId)) return undefined;
    const now = new Date().toISOString();
    const request: MembershipRequest = {
      id: randomUUID(),
      groupId,
      requesterId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(request.id, request);
    try {
      await this.persist();
    } catch (error) {
      this.requests.delete(request.id);
      throw error;
    }
    return structuredClone(request);
  }

  beginDecision(id: string): boolean {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending" || this.decisionLocks.has(id)) return false;
    this.decisionLocks.add(id);
    return true;
  }

  beginNotificationDelivery(id: string): boolean {
    const request = this.requests.get(id);
    if (!request || request.status === "pending" || request.notificationStatus !== "pending"
      || this.notificationLocks.has(id)) return false;
    this.notificationLocks.add(id);
    return true;
  }

  async setApprovalState(id: string, approvalState: ApprovalState | undefined): Promise<MembershipRequest> {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending") throw new Error("Pending membership request not found");
    const previous = structuredClone(request);
    if (approvalState === undefined) delete request.approvalState;
    else request.approvalState = approvalState;
    request.updatedAt = new Date().toISOString();
    try {
      await this.persist();
    } catch (error) {
      this.requests.set(id, previous);
      throw error;
    }
    return structuredClone(request);
  }

  async decide(
    id: string,
    status: Exclude<RequestStatus, "pending">,
    decidedBy: string,
  ): Promise<MembershipRequest> {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending" || !this.decisionLocks.has(id)) {
      throw new Error("Membership request is not available for decision");
    }
    if (status === "approved" && request.approvalState !== "reserved") {
      throw new Error("A group seat must be durably reserved before approval");
    }
    const previous = structuredClone(request);
    request.status = status;
    request.decidedBy = decidedBy;
    request.decidedAt = new Date().toISOString();
    request.updatedAt = request.decidedAt;
    request.notificationEvent = {
      userId: request.requesterId,
      type: status === "approved" ? "request_approved" : "request_rejected",
      message: status === "approved"
        ? "คำขอเข้ากลุ่มได้รับอนุมัติ"
        : "คำขอเข้ากลุ่มถูกปฏิเสธ",
      relatedId: request.id,
    };
    request.notificationStatus = "pending";
    delete request.notificationLastError;
    try {
      await this.persist();
    } catch (error) {
      this.requests.set(id, previous);
      throw error;
    }
    return structuredClone(request);
  }

  pendingNotifications(): MembershipRequest[] {
    return [...this.requests.values()]
      .filter((request) => request.status !== "pending" && request.notificationStatus === "pending")
      .map((request) => structuredClone(request));
  }

  async markNotificationSent(id: string): Promise<MembershipRequest> {
    return this.updateNotification(id, "sent");
  }

  async markNotificationFailed(id: string, message: string): Promise<MembershipRequest> {
    return this.updateNotification(id, "pending", message);
  }

  endDecision(id: string): void {
    this.decisionLocks.delete(id);
  }

  endNotificationDelivery(id: string): void {
    this.notificationLocks.delete(id);
  }

  private async persist(): Promise<void> {
    const records = [...this.requests.values()].map((request) => structuredClone(request));
    const write = this.writeQueue.catch((error: unknown) => {
      console.error("Previous membership data write failed", error);
    }).then(async () => {
      await this.persistRecords(this.filePath, records);
    });
    this.writeQueue = write;
    return write;
  }

  private async updateNotification(
    id: string,
    status: "pending" | "sent",
    lastError?: string,
  ): Promise<MembershipRequest> {
    const request = this.requests.get(id);
    if (!request || request.status === "pending") throw new Error("Decided membership request not found");
    const previous = structuredClone(request);
    request.notificationStatus = status;
    if (lastError === undefined) delete request.notificationLastError;
    else request.notificationLastError = lastError;
    request.updatedAt = new Date().toISOString();
    try {
      await this.persist();
    } catch (error) {
      this.requests.set(id, previous);
      throw error;
    }
    return structuredClone(request);
  }
}

async function persistMembershipRecords(filePath: string, records: MembershipRequest[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch((cleanupError: unknown) => {
      console.error("Failed to clean up temporary membership data", cleanupError);
    });
    throw error;
  }
}

function isMembershipRequest(value: unknown): value is MembershipRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Partial<MembershipRequest>;
  return typeof request.id === "string" && request.id.length > 0
    && typeof request.groupId === "string" && request.groupId.length > 0
    && typeof request.requesterId === "string" && request.requesterId.length > 0
    && (request.status === "pending" || request.status === "approved" || request.status === "rejected")
    && typeof request.createdAt === "string"
    && typeof request.updatedAt === "string"
    && (request.decidedBy === undefined || typeof request.decidedBy === "string")
    && (request.decidedAt === undefined || typeof request.decidedAt === "string")
    && (request.approvalState === undefined || request.approvalState === "reserving" || request.approvalState === "reserved")
    && (request.notificationEvent === undefined || isNotificationEvent(request.notificationEvent))
    && (request.notificationStatus === undefined || request.notificationStatus === "pending" || request.notificationStatus === "sent")
    && (request.notificationLastError === undefined || typeof request.notificationLastError === "string");
}

function isNotificationEvent(value: unknown): value is NotificationEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Partial<NotificationEvent>;
  return typeof event.userId === "string" && event.userId.trim().length > 0
    && (event.type === "request_approved" || event.type === "request_rejected")
    && typeof event.message === "string" && event.message.trim().length > 0 && event.message.length <= 2000
    && typeof event.relatedId === "string" && event.relatedId.trim().length > 0;
}
