import { resolve } from "node:path";
import { createApp } from "./app.js";
import { HttpGroupClient } from "./group-client.js";
import { RequestStore } from "./request-store.js";

const port = Number(process.env.PORT ?? 3004);
const tokenSecret = process.env.AUTH_TOKEN_SECRET;
if (!tokenSecret) throw new Error("AUTH_TOKEN_SECRET must be set");

const groupClient = new HttpGroupClient(process.env.GROUP_URL ?? "");
const store = await RequestStore.open(resolve(process.env.MEMBERSHIP_DATA_FILE ?? "./data/requests.json"));
createApp(store, tokenSecret, groupClient).listen(port, () => {
  console.log(`Membership service listening on port ${port}`);
});
