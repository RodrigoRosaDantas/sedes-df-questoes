import {defineConfig} from "@playwright/test";

const configuredURL = String(process.env.PUBLIC_BASE_URL || "").trim();
if (!configuredURL.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada para o teste público.");
const baseURL = `${configuredURL.replace(/\/+$/, "")}/`;

export default defineConfig({
  testDir: "./tests-public",
  testMatch: [
    "release-contract.spec.js",
    "dashboard-card.spec.js",
    "material-downloads.spec.js",
    "platform-v2-13.spec.js",
    "ux-v2-14.spec.js",
    "navigation-v2-15.spec.js",
  ],
  timeout: 240000,
  retries: 1,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    serviceWorkers: "allow",
    ignoreHTTPSErrors: false,
    extraHTTPHeaders: {
      "cache-control": "no-cache, no-store",
      pragma: "no-cache",
    },
  },
  reporter: "line",
});
