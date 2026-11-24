import { serve } from "@hono/node-server";
import { app } from "./app";

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) }, (i) => console.log(`ThreadNews API → http://localhost:${i.port}  (docs: /docs)`));
