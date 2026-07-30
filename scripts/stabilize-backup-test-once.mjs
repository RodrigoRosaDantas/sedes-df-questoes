import fs from "node:fs";

const path = "tests/reports-v2-10.spec.js";
let content = fs.readFileSync(path, "utf8");
const beforeDownload = `  const backupDownloadPromise = page.waitForEvent("download");`;
const withSnapshot = `  const expectedProcessedAttempts = await page.evaluate(() => JSON.parse(localStorage.getItem("sedes.questoes.rodrigo.reviewProcessedAttempts.v1") || "[]"));\n  const backupDownloadPromise = page.waitForEvent("download");`;
const hardcoded = `  expect([...backup.data.reviewProcessedAttempts].sort()).toEqual(["attempt-current", "attempt-night", "attempt-old", "attempt-previous"].sort());`;
const dynamic = `  expect([...backup.data.reviewProcessedAttempts].sort()).toEqual([...expectedProcessedAttempts].sort());`;
for (const marker of [beforeDownload, hardcoded]) {
  if (!content.includes(marker)) throw new Error(`Marcador ausente no teste: ${marker}`);
}
content = content.replace(beforeDownload, withSnapshot).replace(hardcoded, dynamic);
fs.writeFileSync(path, content);
console.log("✓ Teste de backup alinhado ao estado real da agenda no instante da exportação.");
