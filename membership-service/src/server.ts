import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { HttpGroupClient } from "./group-client.js";
import { HttpNotificationClient } from "./notification-client.js";
import { retryPendingNotifications } from "./notification-delivery.js";
import { RequestStore } from "./request-store.js";

const port = Number(process.env.PORT ?? 3004);
const tokenSecret = process.env.AUTH_TOKEN_SECRET;
if (!tokenSecret || tokenSecret.length < 32) throw new Error("AUTH_TOKEN_SECRET must be set and at least 32 characters long");

const groupClient = new HttpGroupClient(process.env.GROUP_URL ?? "", process.env.GROUP_SERVICE_TOKEN ?? "");
const notificationClient = new HttpNotificationClient(process.env.NOTIFY_URL ?? "", process.env.NOTIFY_SERVICE_TOKEN ?? "");
const store = await RequestStore.open(resolve(process.env.MEMBERSHIP_DATA_FILE ?? "./data/requests.json"));
createApp(store, tokenSecret, groupClient, notificationClient).listen(port, () => {
  console.log(`Membership service listening on port ${port}`);
});

const retryNotifications = () => {
  void retryPendingNotifications(store, notificationClient).catch((error: unknown) => {
    console.error("Notification retry worker failed", error);
  });
};
retryNotifications();
const retryTimer = setInterval(retryNotifications, 30_000);
retryTimer.unref();
