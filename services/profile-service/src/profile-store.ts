import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type Profile = {
  id: string;
  name: string;
  email?: string;
  subjects: string[];
};

export type CreateProfileResult =
  | { status: "created" | "existing"; profile: Profile }
  | { status: "conflict" };

export class ProfileStore {
  private profiles = new Map<string, Profile>();
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static async open(filePath: string): Promise<ProfileStore> {
    const store = new ProfileStore(filePath);
    try {
      const data: unknown = JSON.parse(await readFile(filePath, "utf8"));
      if (!Array.isArray(data)) throw new Error("Profile data must be a JSON array");
      for (const item of data) {
        if (!isProfile(item)) throw new Error("Profile data contains an invalid record");
        store.profiles.set(item.id, item);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(dirname(filePath), { recursive: true });
      await store.persist();
    }
    return store;
  }

  get(id: string): Profile | undefined {
    const profile = this.profiles.get(id);
    return profile ? structuredClone(profile) : undefined;
  }

  async createFromAuth(input: { id: string; name: string; email: string }): Promise<CreateProfileResult> {
    const existing = this.profiles.get(input.id);
    if (existing) {
      if (existing.name !== input.name || existing.email !== input.email) return { status: "conflict" };
      return { status: "existing", profile: structuredClone(existing) };
    }

    const profile: Profile = { ...input, subjects: [] };
    this.profiles.set(profile.id, profile);
    await this.persist();
    return { status: "created", profile: structuredClone(profile) };
  }

  findBySubject(subject: string): Profile[] {
    const normalized = subject.toLocaleLowerCase();
    return [...this.profiles.values()]
      .filter((profile) => profile.subjects.some((item) => item.toLocaleLowerCase() === normalized))
      .map((profile) => structuredClone(profile));
  }

  async setSubjects(id: string, subjects: string[]): Promise<Profile | undefined> {
    const existing = this.profiles.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, subjects: [...subjects] };
    this.profiles.set(id, updated);
    await this.persist();
    return structuredClone(updated);
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify([...this.profiles.values()], null, 2), "utf8");
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<Profile>;
  return typeof profile.id === "string" && profile.id.length > 0
    && typeof profile.name === "string" && profile.name.length > 0
    && (profile.email === undefined || typeof profile.email === "string")
    && Array.isArray(profile.subjects) && profile.subjects.every((subject) => typeof subject === "string");
}
