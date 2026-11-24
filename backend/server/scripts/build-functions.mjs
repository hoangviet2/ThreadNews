// Bundles the API for Cloud Functions into .functions/ (the firebase.json "functions" source).
// firebase-functions + firebase-admin stay external: the Firebase CLI loads them for discovery and Cloud Build installs them.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const out = ".functions";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const deps = JSON.parse(readFileSync("package.json", "utf8")).dependencies;

await build({
  entryPoints: ["src/functions.ts"],
  outfile: `${out}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  legalComments: "none",
  external: ["firebase-functions", "firebase-admin"],
  banner: { js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" },
});
writeFileSync(
  `${out}/package.json`,
  JSON.stringify({ name: "threadnews-api-functions", private: true, type: "module", main: "index.mjs", engines: { node: "22" }, dependencies: { "firebase-functions": deps["firebase-functions"], "firebase-admin": deps["firebase-admin"] } }, null, 2),
);
// Non-secret runtime config (secrets live in Secret Manager). FIREBASE_* names are reserved by Cloud Functions.
writeFileSync(`${out}/.env`, ["ALLOWED_ORIGINS=https://threadnews-4c8bd.web.app,https://threadnews-4c8bd.firebaseapp.com,http://localhost:5173,chrome-extension://jkemlohoabppeblpfaimplefhifngjjo", "APP_CHECK_ENFORCE=false", ""].join("\n"));
execSync("npm install --omit=dev --no-package-lock --no-audit --no-fund --loglevel=error", { cwd: out, stdio: "inherit" });
console.log(`built ${out}/index.mjs`);
