import { resolve } from "node:path";
import { createApp } from "./app.js";
import { ProfileStore } from "./profile-store.js";

const port = Number(process.env.PORT ?? 3002);
const tokenSecret = process.env.AUTH_TOKEN_SECRET;
if (!tokenSecret) throw new Error("AUTH_TOKEN_SECRET must be set");

const store = await ProfileStore.open(resolve(process.env.PROFILE_DATA_FILE ?? "./data/profiles.json"));
createApp(store, tokenSecret).listen(port, () => {
  console.log(`Profile service listening on port ${port}`);
});
