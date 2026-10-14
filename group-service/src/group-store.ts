import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type Group = {
  id: string;
  subject: string;
  topic: string;
  datetime: string;
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
  datetime: string;
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
      await store.persist();
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
    const now = new Date().toISOString();
    const group: Group = {
      id: randomUUID(),
      subject: input.subject,
      topic: input.topic,
      datetime: input.datetime,
      maxMembers: input.maxMembers,
      location: input.location,
      ownerId: input.ownerId,
      members: [...input.members],
      isOpen: input.isOpen,
      createdAt: now,
      updatedAt: now,
    };
    this.groups.set(group.id, group);
    await this.persist();
    return structuredClone(group);
  }

  async update(id: string, patch: Partial<Omit<Group, "id" | "createdAt">>): Promise<Group | undefined> {
    const existing = this.groups.get(id);
    if (!existing) return undefined;
    const updated: Group = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.groups.set(id, updated);
    await this.persist();
    return structuredClone(updated);
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify([...this.groups.values()], null, 2), "utf8");
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }
}

function isGroup(value: unknown): value is Group {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<Group>;
  return typeof group.id === "string" && group.id.length > 0
    && typeof group.subject === "string"
    && typeof group.topic === "string"
    && typeof group.datetime === "string"
    && typeof group.maxMembers === "number"
    && typeof group.location === "string"
    && typeof group.ownerId === "string" && group.ownerId.length > 0
    && Array.isArray(group.members) && group.members.every((member) => typeof member === "string")
    && typeof group.isOpen === "boolean"
    && typeof group.createdAt === "string"
    && typeof group.updatedAt === "string";
}
