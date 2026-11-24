import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { defineConfig } from "wxt";

// Manifest values come from .env / .env.local (WXT_* vars). See .env.example.
for (const f of [".env", ".env.local"]) if (existsSync(f)) process.loadEnvFile(f);
const env = process.env;

const apiOrigin = (() => {
  try {
    return env.WXT_API_BASE_URL ? `${new URL(env.WXT_API_BASE_URL).origin}/*` : null;
  } catch {
    return null;
  }
})();

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "ThreadNews — is this article still true?",
    short_name: "ThreadNews",
    description: "Checks if a news story has moved on since the article you're reading. On-device AI first.",
    ...(env.WXT_EXTENSION_KEY ? { key: env.WXT_EXTENSION_KEY } : {}),
    permissions: ["sidePanel", "activeTab", "scripting", "storage", "alarms", "identity"],
    // Asked at runtime with an explanation; everything works without it.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    host_permissions: apiOrigin ? [apiOrigin] : [],
    action: { default_title: "ThreadNews" },
    ...(env.WXT_OAUTH_CLIENT_ID ? { oauth2: { client_id: env.WXT_OAUTH_CLIENT_ID, scopes: ["openid", "email", "profile"] } } : {}),
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    minimum_chrome_version: "148",
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
  },
});
