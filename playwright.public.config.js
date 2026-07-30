import {defineConfig} from "@playwright/test";

const baseURL = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
if (!baseURL.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada para o teste público.");

export default defineConfig({
  testDir: "./tests-public",
  timeout: 90000,
  retries: 2,
  use: {
    baseURL,
    headless: true,
    serviceWorkers: "allow",
    ignoreHTTPSErrors: false,
  },
  reporter: "line",
});
