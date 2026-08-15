import {defineConfig} from "@playwright/test";

const configuredURL = String(process.env.PUBLIC_BASE_URL || "").trim();
if (!configuredURL.startsWith("http")) throw new Error("PUBLIC_BASE_URL não informada para o teste Firebase.");
const baseURL = `${configuredURL.replace(/\/+$/, "")}/`;

export default defineConfig({
  testDir: "./tests-integration",
  testMatch: ["firebase-two-device-v1.spec.js"],
  timeout: 180000,
  retries: 0,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    serviceWorkers: "block",
  },
  reporter: "line",
});
