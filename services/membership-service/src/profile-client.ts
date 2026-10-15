export type RequesterProfile = { id: string; name: string; email?: string };
export type MemberDisplayName = { id: string; name: string };

export interface ProfileClient {
  getProfiles(ids: string[]): Promise<RequesterProfile[]>;
  getDisplayNames(ids: string[]): Promise<MemberDisplayName[]>;
}

export class ProfileServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ProfileServiceError";
  }
}

export class HttpProfileClient implements ProfileClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly serviceToken: string) {
    if (!baseUrl.trim()) throw new Error("PROFILE_URL must be set");
    if (!serviceToken.trim()) throw new Error("PROFILE_SERVICE_TOKEN must be set");
    this.baseUrl = new URL(baseUrl).toString().replace(/\/+$/, "");
  }

  async getProfiles(ids: string[]): Promise<RequesterProfile[]> {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const profiles: RequesterProfile[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += 500) {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/internal/users/lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Service-Token": this.serviceToken },
          body: JSON.stringify({ ids: uniqueIds.slice(offset, offset + 500) }),
        });
      } catch (error) {
        console.error("Profile Service lookup failed", error);
        throw new ProfileServiceError(503, "Profile Service is unavailable");
      }
      if (!response.ok) {
        const status = response.status === 401 || response.status === 400 ? 502 : 503;
        throw new ProfileServiceError(status, "Profile Service could not resolve requester profiles");
      }
      const data: unknown = await response.json().catch(() => undefined);
      if (!Array.isArray(data) || !data.every(isRequesterProfile)) {
        throw new ProfileServiceError(502, "Profile Service returned invalid requester profiles");
      }
      profiles.push(...data);
    }
    return profiles;
  }

  async getDisplayNames(ids: string[]): Promise<MemberDisplayName[]> {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const profiles: MemberDisplayName[] = [];
    for (let offset = 0; offset < uniqueIds.length; offset += 500) {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/internal/users/display-names`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Service-Token": this.serviceToken },
          body: JSON.stringify({ ids: uniqueIds.slice(offset, offset + 500) }),
        });
      } catch (error) {
        console.error("Profile Service display-name lookup failed", error);
        throw new ProfileServiceError(503, "Profile Service is unavailable");
      }
      if (!response.ok) {
        const status = response.status === 401 || response.status === 400 ? 502 : 503;
        throw new ProfileServiceError(status, "Profile Service could not resolve group member names");
      }
      const data: unknown = await response.json().catch(() => undefined);
      if (!Array.isArray(data) || !data.every(isMemberDisplayName)) {
        throw new ProfileServiceError(502, "Profile Service returned invalid group member names");
      }
      profiles.push(...data);
    }
    return profiles;
  }
}

function isRequesterProfile(value: unknown): value is RequesterProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<RequesterProfile>;
  return typeof profile.id === "string" && typeof profile.name === "string"
    && (profile.email === undefined || typeof profile.email === "string");
}

function isMemberDisplayName(value: unknown): value is MemberDisplayName {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Partial<MemberDisplayName>;
  return typeof profile.id === "string" && typeof profile.name === "string";
}
