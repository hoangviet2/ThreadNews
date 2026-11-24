/** Vercel Node.js function entry (bundled by scripts/build.mjs into .vercel/output). */
import { getRequestListener } from "@hono/node-server";
import { app } from "./app";

export default getRequestListener(app.fetch);
