import {defineConfig} from "@playwright/test";

const configuredURL = String(process.env.PUBLIC_BASE_URL || "").trim();
if (!configuredURL.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada para o teste público.");
const baseURL = `${configuredURL.replace(/\/+$/, "")}/`;

export default defineConfig({
  testDir: "./tests-public",
  timeout: 180000,
  retries: 1,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    serviceWorkers: "allow",
    ignoreHTTPSErrors: false,
  },
  reporter: "line",
});
