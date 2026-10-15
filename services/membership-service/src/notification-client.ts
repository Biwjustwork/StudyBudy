export type NotificationEvent = {
  userId: string;
  type: "request_received" | "request_approved" | "request_rejected";
  message: string;
  relatedId: string;
  groupId?: string;
};

export interface NotificationClient {
  send(event: NotificationEvent): Promise<void>;
}

export class NotificationServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "NotificationServiceError";
  }
}

export class HttpNotificationClient implements NotificationClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly serviceToken: string) {
    if (!baseUrl.trim()) throw new Error("NOTIFY_URL must be set");
    if (!serviceToken.trim()) throw new Error("NOTIFY_SERVICE_TOKEN must be set");
    const parsed = new URL(baseUrl);
    this.baseUrl = parsed.toString().replace(/\/+$/, "");
  }

  async send(event: NotificationEvent): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/internal/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Token": this.serviceToken,
        },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error("Notification Service request failed", error);
      throw new NotificationServiceError(503, "Notification Service is unavailable");
    }

    if (response.status === 200 || response.status === 201) return;
    const status = [400, 401, 409].includes(response.status) ? response.status : 503;
    const message = response.status === 400
      ? "Notification Service rejected the event"
      : response.status === 401
        ? "Notification Service rejected the service token"
        : response.status === 409
          ? "Notification event conflicts with an existing event"
          : "Notification Service is unavailable";
    throw new NotificationServiceError(status, message);
  }
}
