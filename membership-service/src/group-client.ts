export type GroupSnapshot = {
  id: string;
  ownerId: string;
  members: string[];
  maxMembers: number;
  isOpen: boolean;
};

export interface GroupClient {
  getGroup(groupId: string, bearerToken: string): Promise<GroupSnapshot>;
  addMember(groupId: string, userId: string, ownerBearerToken: string): Promise<void>;
}

export class GroupServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GroupServiceError";
  }
}

export class HttpGroupClient implements GroupClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    if (!baseUrl.trim()) throw new Error("GROUP_URL must be set");
    const parsed = new URL(baseUrl);
    this.baseUrl = parsed.toString().replace(/\/+$/, "");
  }

  async getGroup(groupId: string, bearerToken: string): Promise<GroupSnapshot> {
    const response = await this.request(`/api/groups/${encodeURIComponent(groupId)}`, bearerToken);
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) throw new GroupServiceError(502, "Group Service returned invalid JSON");
      throw error;
    }
    if (!isGroupSnapshot(body)) {
      throw new GroupServiceError(502, "Group Service returned an invalid group");
    }
    return body;
  }

  async addMember(groupId: string, userId: string, ownerBearerToken: string): Promise<void> {
    const response = await this.request(`/api/groups/${encodeURIComponent(groupId)}/members`, ownerBearerToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (response.status !== 200) throw new GroupServiceError(502, "Group Service returned an unexpected response");
  }

  private async request(path: string, bearerToken: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${bearerToken}`,
        },
      });
    } catch (error) {
      console.error("Group Service request failed", error);
      throw new GroupServiceError(503, "Group Service is unavailable");
    }
    if (response.ok) return response;
    const status = [400, 401, 403, 404, 409, 422].includes(response.status) ? response.status : 503;
    const message = response.status === 422
      ? "Group is full or closed for new members"
      : response.status === 409
        ? "User is already a member of this group"
        : response.status === 404
          ? "Group not found"
          : response.status === 403
            ? "Only the group owner can add members"
            : response.status === 401
              ? "Group Service rejected the bearer token"
              : response.status === 400
                ? "Group Service rejected the request"
                : "Group Service is unavailable";
    throw new GroupServiceError(status, message);
  }
}

function isGroupSnapshot(value: unknown): value is GroupSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const group = value as Partial<GroupSnapshot>;
  return typeof group.id === "string"
    && typeof group.ownerId === "string"
    && Array.isArray(group.members) && group.members.every((member) => typeof member === "string")
    && Number.isInteger(group.maxMembers)
    && typeof group.isOpen === "boolean";
}
