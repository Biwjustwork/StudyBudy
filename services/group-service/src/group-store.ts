import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type Group = {
  id: string;
  subject: string;
  topic: string;
  startsAt: string;
  maxMembers: number;
  location: string;
  ownerId: string;
  members: string[];
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateGroupInput = {
  subject: string;
  topic: string;
  startsAt: string;
  maxMembers: number;
  location: string;
  ownerId: string;
  members: string[];
  isOpen: boolean;
};

export class GroupStore {
  private groups = new Map<string, Group>();
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  // เปิด store จากไฟล์ JSON: ไม่มีไฟล์ = สร้างใหม่เปล่า ๆ (ไฟล์เก่าเสียจะโยน error)
  static async open(filePath: string): Promise<GroupStore> {
    const store = new GroupStore(filePath);
    try {
      const data: unknown = JSON.parse(await readFile(filePath, "utf8"));
      if (!Array.isArray(data)) throw new Error("Group data must be a JSON array");
      for (const item of data) {
        if (!isGroup(item)) throw new Error("Group data contains an invalid record");
        store.groups.set(item.id, item);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(dirname(filePath), { recursive: true });
      await store.persist(store.groups);
    }
    return store;
  }

  list(): Group[] {
    return [...this.groups.values()].map((group) => structuredClone(group));
  }

  get(id: string): Group | undefined {
    const group = this.groups.get(id);
    return group ? structuredClone(group) : undefined;
  }

  async create(input: CreateGroupInput): Promise<Group> {
    return this.serialize(async () => {
      const now = new Date().toISOString();
      const group: Group = {
        id: randomUUID(), subject: input.subject, topic: input.topic, startsAt: input.startsAt,
        maxMembers: input.maxMembers, location: input.location, ownerId: input.ownerId,
        members: [...input.members], isOpen: input.isOpen, createdAt: now, updatedAt: now,
      };
      const next = new Map(this.groups);
      next.set(group.id, group);
      await this.persist(next);
      this.groups = next;
      return structuredClone(group);
    });
  }

  async deleteIfOwnerAlone(id: string): Promise<"deleted" | "not_found" | "not_empty"> {
    return this.serialize(async () => {
      const group = this.groups.get(id);
      if (!group) return "not_found";
      if (group.members.length !== 1 || group.members[0] !== group.ownerId) return "not_empty";
      const next = new Map(this.groups);
      next.delete(id);
      await this.persist(next);
      this.groups = next;
      return "deleted";
    });
  }

  async update(id: string, patch: Partial<Omit<Group, "id" | "createdAt">>): Promise<Group | undefined> {
    return this.serialize(async () => {
      const existing = this.groups.get(id);
      if (!existing) return undefined;
      const updated: Group = {
        ...existing, ...patch, id: existing.id,
        createdAt: existing.createdAt, updatedAt: new Date().toISOString(),
      };
      const next = new Map(this.groups);
      next.set(id, updated);
      await this.persist(next);
      this.groups = next;
      return structuredClone(updated);
    });
  }

  async addMember(id: string, userId: string): Promise<{ ok: true; value: Group } | { ok: false; error: "not_found" | "conflict" | "capacity_exceeded" | "closed" }> {
    return this.serialize(async () => {
      const group = this.groups.get(id);
      if (!group) return { ok: false, error: "not_found" };
      if (!group.isOpen) return { ok: false, error: "closed" };
      if (group.members.includes(userId)) return { ok: false, error: "conflict" };
      if (group.members.length >= group.maxMembers) return { ok: false, error: "capacity_exceeded" };
      const updated = { ...group, members: [...group.members, userId], updatedAt: new Date().toISOString() };
      const next = new Map(this.groups);
      next.set(id, updated);
      await this.persist(next);
      this.groups = next;
      return { ok: true, value: structuredClone(updated) };
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(groups: Map<string, Group>): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(temporaryPath, JSON.stringify([...groups.values()], null, 2), "utf8");
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
}

function isGroup(value: unknown): value is Group {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<Group>;
  return typeof group.id === "string" && group.id.length > 0
    && typeof group.subject === "string"
    && typeof group.topic === "string"
    && typeof group.startsAt === "string"
    && typeof group.maxMembers === "number"
    && typeof group.location === "string"
    && typeof group.ownerId === "string" && group.ownerId.length > 0
    && Array.isArray(group.members) && group.members.every((member) => typeof member === "string")
    && typeof group.isOpen === "boolean"
    && typeof group.createdAt === "string"
    && typeof group.updatedAt === "string";
}
