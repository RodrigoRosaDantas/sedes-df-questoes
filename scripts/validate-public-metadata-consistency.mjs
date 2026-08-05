import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "dist", "data", "release");
const catalogPath = path.join(releaseDirectory, "catalogo.json");
const manifestPath = path.join(releaseDirectory, "manifest.json");
const releaseMetaPath = path.join(releaseDirectory, "release-meta.json");

const catalogText = fs.readFileSync(catalogPath, "utf8");
const catalog = JSON.parse(catalogText);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const releaseMeta = JSON.parse(fs.readFileSync(releaseMetaPath, "utf8"));

const expected = {
  banco_mestre: Number(releaseMeta.banco_mestre),
  materiais: Number(releaseMeta.materials),
  questoes: Number(releaseMeta.questions),
  discursivas_consulta: Number(releaseMeta.discursive_display_items || 0),
  aguardando_auditoria: Number(releaseMeta.awaiting_audit),
  provas: Number(releaseMeta.proofs),
  simulados: Number(releaseMeta.simulations),
};

for (const [key, value] of Object.entries(expected)) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`release-meta inválido em ${key}: ${value}`);
  if (Number(catalog.summary?.[key]) !== value) throw new Error(`catalogo.json diverge em ${key}.`);
  if (Number(manifest.summary?.[key]) !== value) throw new Error(`manifest.json diverge em ${key}.`);
}

if (expected.banco_mestre - expected.questoes - expected.discursivas_consulta !== expected.aguardando_auditoria) {
  throw new Error("A decomposição Banco Mestre = questões + discursivas de consulta + auditoria não fecha.");
}
if (expected.provas + expected.simulados !== expected.materiais) {
  throw new Error("A decomposição materiais = provas + simulados não fecha.");
}

const catalogHash = crypto.createHash("sha256").update(catalogText).digest("hex");
if (manifest.catalog_sha256 !== catalogHash) {
  throw new Error("manifest.json contém hash obsoleto do catálogo.");
}

console.log(
  `✓ Contrato público unificado: banco ${expected.banco_mestre}; ${expected.questoes} questões; `
  + `${expected.discursivas_consulta} discursivas de consulta; ${expected.aguardando_auditoria} em auditoria; `
  + `${expected.materiais} materiais.`,
);
