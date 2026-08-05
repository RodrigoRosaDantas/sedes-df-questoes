import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "dist", "data", "release");
const catalogPath = path.join(releaseDirectory, "catalogo.json");
const manifestPath = path.join(releaseDirectory, "manifest.json");
const releaseMetaPath = path.join(releaseDirectory, "release-meta.json");

for (const required of [catalogPath, manifestPath, releaseMetaPath]) {
  if (!fs.existsSync(required)) throw new Error(`Metadado público obrigatório ausente: ${path.relative(root, required)}`);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const releaseMeta = JSON.parse(fs.readFileSync(releaseMetaPath, "utf8"));

const reconciledSummary = {
  ...(catalog.summary || {}),
  banco_mestre: Number(releaseMeta.banco_mestre),
  materiais: Number(releaseMeta.materials),
  questoes: Number(releaseMeta.questions),
  discursivas_consulta: Number(releaseMeta.discursive_display_items || 0),
  aguardando_auditoria: Number(releaseMeta.awaiting_audit),
  provas: Number(releaseMeta.proofs),
  simulados: Number(releaseMeta.simulations),
};

for (const [key, value] of Object.entries(reconciledSummary)) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Resumo reconciliado inválido em ${key}: ${value}`);
}
if (
  reconciledSummary.banco_mestre
  - reconciledSummary.questoes
  - reconciledSummary.discursivas_consulta
  !== reconciledSummary.aguardando_auditoria
) {
  throw new Error("A decomposição Banco Mestre = questões + discursivas de consulta + auditoria não fecha.");
}

catalog.summary = reconciledSummary;
const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(catalogPath, catalogText);

manifest.summary = {...(manifest.summary || {}), ...reconciledSummary};
manifest.catalog_sha256 = crypto.createHash("sha256").update(catalogText).digest("hex");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `✓ Metadados públicos reconciliados: banco ${reconciledSummary.banco_mestre}; `
  + `${reconciledSummary.questoes} questões; ${reconciledSummary.discursivas_consulta} discursivas de consulta; `
  + `${reconciledSummary.aguardando_auditoria} em auditoria; ${reconciledSummary.materiais} materiais.`,
);
