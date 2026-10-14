import { resolve } from "node:path";
import { createApp } from "./app.js";
import { GroupStore } from "./group-store.js";

const port = Number(process.env.PORT ?? 3003);
const tokenSecret = process.env.AUTH_TOKEN_SECRET;
if (!tokenSecret) throw new Error("AUTH_TOKEN_SECRET must be set");

const store = await GroupStore.open(resolve(process.env.GROUP_DATA_FILE ?? "./data/groups.json"));
createApp(store, tokenSecret).listen(port, () => {
  console.log(`Group service listening on port ${port}`);
});
