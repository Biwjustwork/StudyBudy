import { resolve } from "node:path";
import { createApp } from "./app.js";
import { NotificationStore } from "./notification-store.js";

async function start() {
  const port = Number(process.env.PORT ?? 3005);
  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  const serviceToken = process.env.NOTIFY_SERVICE_TOKEN;
  const dataFile = process.env.NOTIFICATION_DATA_FILE ?? "./data/notifications.json";
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
  if (!tokenSecret || tokenSecret.trim().length < 32) throw new Error("AUTH_TOKEN_SECRET must contain at least 32 characters");
  if (!serviceToken?.trim()) throw new Error("NOTIFY_SERVICE_TOKEN must be set");
  if (!dataFile.trim()) throw new Error("NOTIFICATION_DATA_FILE must be a non-empty path");
  const store = await NotificationStore.open(resolve(dataFile));
  const server = createApp(store, tokenSecret, serviceToken).listen(port, () => {
    console.log(`Notification service listening on port ${port}`);
  });
  const stop = () => server.close(() => { process.exitCode = 0; });
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

start().catch(() => {
  console.error("Notification service could not start. Check PORT, secrets and NOTIFICATION_DATA_FILE; existing data is preserved.");
  process.exitCode = 1;
});
