import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = relative => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const writeJSON = (relative, value) => fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

const snapshot = readJSON("data/notion/published.json");
const catalog = readJSON("data/release/catalogo.json");
const manifest = readJSON("data/release/manifest.json");

const generatedAt = String(snapshot.generated_at || "").trim();
if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
  throw new Error("Snapshot do Notion sem generated_at válido para proveniência.");
}

const snapshotTotal = Number(snapshot.totals?.all);
const catalogBank = Number(catalog.summary?.banco_mestre);
if (!Number.isInteger(snapshotTotal) || snapshotTotal < 0 || catalogBank !== snapshotTotal) {
  throw new Error(`Banco Mestre divergente entre snapshot (${snapshotTotal}) e catálogo (${catalogBank}).`);
}

const snapshotUrl = String(snapshot.source?.database_url || "").trim();
const catalogUrl = String(catalog.source?.notion_url || "").trim();
if (!snapshotUrl || snapshotUrl !== catalogUrl) {
  throw new Error("Fonte Notion divergente entre snapshot e catálogo.");
}

catalog.exported_at = generatedAt;
const catalogContent = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(path.join(root, "data/release/catalogo.json"), catalogContent);

manifest.generated_at = generatedAt;
manifest.catalog_sha256 = sha256(catalogContent);
writeJSON("data/release/manifest.json", manifest);

console.log(`✓ Proveniência reconciliada com snapshot ${generatedAt}: banco ${snapshotTotal}, catálogo e manifesto alinhados.`);
