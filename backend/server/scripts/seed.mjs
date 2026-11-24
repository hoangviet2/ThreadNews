// Seed the graph (docs/GRAPHRAG.md §8): one /internal/admin/seed call per story, then one community build.
// Usage: API_BASE_URL=http://localhost:8787 CRON_SECRET=… pnpm seed [path/to/stories.seed.json]
// The file is an array of CheckRequest objects: { articleUrl, headline, publisher?, publishedAt?, claims[], entities[] }.
import { readFileSync } from "node:fs";

const base = process.env.API_BASE_URL ?? "http://localhost:8787";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is required");
const file = process.argv[2] ?? new URL("./stories.seed.json", import.meta.url);
const items = JSON.parse(readFileSync(file, "utf8"));

const post = async (path, body) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Cron-Secret": secret }, body: JSON.stringify(body ?? {}) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text}`);
  return text;
};

for (const [i, item] of items.entries()) console.log(`[${i + 1}/${items.length}] ${item.headline}`, await post("/internal/admin/seed", { item }));
console.log("communities", await post("/internal/cron/communities"));
