import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type RequestStatus = "pending" | "approved" | "rejected";

export type MembershipRequest = {
  id: string;
  groupId: string;
  requesterId: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  notificationStatus?: "pending";
};

export class RequestStore {
  private requests = new Map<string, MembershipRequest>();
  private decisionLocks = new Set<string>();
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static async open(filePath: string): Promise<RequestStore> {
    const store = new RequestStore(filePath);
    try {
      const data: unknown = JSON.parse(await readFile(filePath, "utf8"));
      if (!Array.isArray(data)) throw new Error("Membership data must be a JSON array");
      for (const item of data) {
        if (!isMembershipRequest(item)) throw new Error("Membership data contains an invalid record");
        store.requests.set(item.id, item);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(dirname(filePath), { recursive: true });
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

  async decide(
    id: string,
    status: Exclude<RequestStatus, "pending">,
    decidedBy: string,
  ): Promise<MembershipRequest> {
    const request = this.requests.get(id);
    if (!request || request.status !== "pending" || !this.decisionLocks.has(id)) {
      throw new Error("Membership request is not available for decision");
    }
    const previous = structuredClone(request);
    request.status = status;
    request.decidedBy = decidedBy;
    request.decidedAt = new Date().toISOString();
    request.updatedAt = request.decidedAt;
    // TODO(member 5): A Notification Service is not present on this branch.
    // Keep the event recoverable with the decided request until its endpoint is agreed.
    request.notificationStatus = "pending";
    try {
      await this.persist();
    } catch (error) {
      this.requests.set(id, previous);
      throw error;
    }
    return structuredClone(request);
  }

  endDecision(id: string): void {
    this.decisionLocks.delete(id);
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.catch((error: unknown) => {
      console.error("Previous membership data write failed", error);
    }).then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify([...this.requests.values()], null, 2), "utf8");
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
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
    && (request.notificationStatus === undefined || request.notificationStatus === "pending");
}
