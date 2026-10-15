import { type NotificationClient, type NotificationEvent } from "./notification-client.js";
import { type MembershipRequest, RequestStore } from "./request-store.js";

export async function deliverNotification(
  store: RequestStore,
  client: NotificationClient,
  request: MembershipRequest,
): Promise<MembershipRequest> {
  if (!store.beginNotificationDelivery(request.id)) return store.get(request.id) ?? request;
  try {
    const event = toNotificationEvent(request);
    try {
      await client.send(event);
      return await store.markNotificationSent(request.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notification delivery failed";
      console.error(`Notification delivery pending for request ${request.id}: ${message}`);
      try {
        return await store.markNotificationFailed(request.id, message);
      } catch (persistError) {
        console.error(`Failed to persist notification retry state for request ${request.id}`, persistError);
        return store.get(request.id) ?? request;
      }
    }
  } finally {
    store.endNotificationDelivery(request.id);
  }
}

export async function retryPendingNotifications(
  store: RequestStore,
  client: NotificationClient,
): Promise<void> {
  for (const request of store.pendingNotifications()) {
    await deliverNotification(store, client, request);
  }
}

export function toNotificationEvent(request: MembershipRequest): NotificationEvent {
  if (request.notificationEvent) return structuredClone(request.notificationEvent);
  if (request.status !== "approved" && request.status !== "rejected") {
    throw new Error("Cannot notify about an undecided membership request");
  }
  return {
    userId: request.requesterId,
    type: request.status === "approved" ? "request_approved" : "request_rejected",
    message: request.status === "approved"
      ? "คำขอเข้ากลุ่มได้รับอนุมัติ"
      : "คำขอเข้ากลุ่มถูกปฏิเสธ",
    relatedId: request.id,
  };
}
