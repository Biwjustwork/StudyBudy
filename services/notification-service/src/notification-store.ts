import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type NotificationEvent = {
  userId: string;
  type: "request_received" | "request_approved" | "request_rejected";
  message: string;
  relatedId: string;
  groupId?: string;
};

export type Notification = NotificationEvent & {
  id: string;
  read: boolean;
  createdAt: string;
  readAt: string | null;
};

export type NotificationPage = {
  items: Notification[];
  unreadCount: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export class NotificationConflictError extends Error {}

function eventKey(event: NotificationEvent): string {
  return JSON.stringify([event.userId, event.relatedId, event.type]);
}

export class NotificationStore {
  private notifications = new Map<string, Notification>();
  private writeQueue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly filePath: string) {}

  static async open(filePath: string): Promise<NotificationStore> {
    if (!filePath.trim()) throw new Error("NOTIFICATION_DATA_FILE must be a non-empty path");
    const store = new NotificationStore(filePath);
    let contents: string;
    try {
      contents = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await store.persist([]);
      return store;
    }
    const records: unknown = JSON.parse(contents);
    if (!Array.isArray(records) || !records.every(isNotification)) {
      throw new Error("Notification data must be an array of valid records");
    }
    const eventKeys = new Set<string>();
    for (const record of records) {
      const key = eventKey(record);
      if (store.notifications.has(record.id) || eventKeys.has(key)) {
        throw new Error("Notification data contains duplicate IDs or events");
      }
      store.notifications.set(record.id, record);
      eventKeys.add(key);
    }
    return store;
  }

  list(userId: string, offset = 0, limit = 20): NotificationPage {
    // Reverse insertion order makes events created in the same millisecond deterministic.
    const matching = [...this.notifications.values()].reverse()
      .filter((notification) => notification.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const selected = matching.slice(offset, offset + limit);
    const hasMore = offset + selected.length < matching.length;
    return {
      items: selected.map((notification) => structuredClone(notification)),
      unreadCount: matching.filter((notification) => !notification.read).length,
      hasMore,
      nextOffset: hasMore ? offset + selected.length : null,
    };
  }

  async create(event: NotificationEvent): Promise<{ created: boolean; notification: Notification }> {
    return this.serialize(async () => {
      const existing = [...this.notifications.values()].find((item) => eventKey(item) === eventKey(event));
      if (existing) {
        if (existing.message !== event.message) throw new NotificationConflictError("Event message conflicts with the saved notification");
        return { created: false, notification: structuredClone(existing) };
      }
      const notification: Notification = {
        ...event, id: randomUUID(), read: false, createdAt: new Date().toISOString(), readAt: null,
      };
      const next = new Map(this.notifications);
      next.set(notification.id, notification);
      await this.persist([...next.values()]);
      this.notifications = next;
      return { created: true, notification: structuredClone(notification) };
    });
  }

  async markRead(id: string, userId: string): Promise<
    { status: "ok"; notification: Notification } | { status: "not_found" } | { status: "forbidden" }
  > {
    return this.serialize(async () => {
      const existing = this.notifications.get(id);
      if (!existing) return { status: "not_found" };
      if (existing.userId !== userId) return { status: "forbidden" };
      if (existing.read) return { status: "ok", notification: structuredClone(existing) };
      const updated = { ...existing, read: true, readAt: new Date().toISOString() };
      const next = new Map(this.notifications);
      next.set(id, updated);
      // Publish the new state only after disk persistence succeeds.
      await this.persist([...next.values()]);
      this.notifications = next;
      return { status: "ok", notification: structuredClone(updated) };
    });
  }

  async pruneReadBefore(cutoff: Date): Promise<number> {
    const cutoffTime = cutoff.getTime();
    if (!Number.isFinite(cutoffTime)) throw new Error("Notification retention cutoff must be a valid date");
    return this.serialize(async () => {
      const next = new Map(this.notifications);
      let removed = 0;
      for (const [id, notification] of next) {
        if (notification.read && Date.parse(notification.createdAt) < cutoffTime) {
          next.delete(id);
          removed += 1;
        }
      }
      if (removed === 0) return 0;
      await this.persist([...next.values()]);
      this.notifications = next;
      return removed;
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => {});
    return result;
  }

  private async persist(records: Notification[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
}

function isNotification(value: unknown): value is Notification {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<Notification>;
  const nonEmpty = (text: unknown): text is string => typeof text === "string" && text.trim().length > 0;
  const timestamp = (text: unknown): text is string => nonEmpty(text) && Number.isFinite(Date.parse(text));
  return nonEmpty(record.id) && nonEmpty(record.userId) && nonEmpty(record.relatedId)
    && nonEmpty(record.message) && record.message.length <= 2000
    && (record.type === "request_received" || record.type === "request_approved" || record.type === "request_rejected")
    && (record.groupId === undefined || nonEmpty(record.groupId))
    && (record.type !== "request_received" || nonEmpty(record.groupId))
    && timestamp(record.createdAt)
    && ((record.read === false && record.readAt === null) || (record.read === true && timestamp(record.readAt)));
}
