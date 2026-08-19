import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const worker = read("service-worker.js");
const sourceBuild = JSON.parse(read("data/release/build-info.json"));
const sourceRelease = JSON.parse(read("data/release/release-meta.json"));

if (!worker.includes("canonicalMutableDataUrl")) throw new Error("Service worker não canonicaliza as chaves dos JSONs mutáveis.");
if (!worker.includes("cacheKey: canonicalKey, fallback: canonicalKey")) throw new Error("Fallback offline não usa a mesma chave canônica da gravação.");
for (const stale of ["catalogo.json?release=", "study-index.json?release=", "build-info.json?release=", "release-meta.json?release="]) {
  if (worker.includes(stale)) throw new Error(`Service worker ainda pré-cacheia URL obsoleta: ${stale}`);
}
for (const required of ["./data/release/catalogo.json", "./data/release/study-index.json", "./data/release/build-info.json", "./data/release/release-meta.json"]) {
  if (!worker.includes(required)) throw new Error(`JSON canônico ausente do shell offline: ${required}`);
}

for (const [name, meta] of [["build-info fonte", sourceBuild], ["release-meta fonte", sourceRelease]]) {
  if (meta.source_sha !== null) throw new Error(`${name} não pode fingir um SHA autoritativo.`);
  if (meta.provenance_scope !== "source-template") throw new Error(`${name} precisa declarar escopo source-template.`);
  if (Object.keys(meta.source_files_sha256 || {}).length !== 0) throw new Error(`${name} não pode carregar hashes históricos como se fossem atuais.`);
}

const distReleaseDir = path.join(root, "dist", "data", "release");
if (fs.existsSync(distReleaseDir)) {
  const buildInfo = JSON.parse(fs.readFileSync(path.join(distReleaseDir, "build-info.json"), "utf8"));
  const releaseMeta = JSON.parse(fs.readFileSync(path.join(distReleaseDir, "release-meta.json"), "utf8"));
  const requiredHashes = [
    "home_study_edital_js",
    "home_study_today_js",
    "home_study_today_css",
    "home_study_subjects_js",
    "home_study_subjects_css",
    "resolver_context_js",
    "resolver_context_css",
    "product_integrity_js",
  ];
  for (const meta of [buildInfo, releaseMeta]) {
    if (meta.provenance_contract_version !== "2.22") throw new Error("Recibo público sem contrato de proveniência v2.22.");
    if (!meta.source_sha || meta.source_sha === "local") throw new Error("Recibo público sem SHA autoritativo do commit.");
    for (const key of requiredHashes) if (!meta.source_files_sha256?.[key]) throw new Error(`Hash UX crítico ausente do recibo público: ${key}.`);
  }
  for (const key of requiredHashes) {
    if (buildInfo.source_files_sha256[key] !== releaseMeta.source_files_sha256[key]) throw new Error(`Hash UX crítico divergente entre recibos: ${key}.`);
  }
}

console.log("✓ Auditoria v2.22: matching do edital protegido, cache offline canônico e proveniência UX completa, incluindo integridade de produto.");