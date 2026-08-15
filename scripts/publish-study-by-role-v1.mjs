import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const source = path.join(root, "estudo-por-cargo.html");
const target = path.join(dist, "estudo-por-cargo.html");

if (!fs.existsSync(dist)) throw new Error("Dist ausente antes da publicação do Estudo por Cargo.");
if (!fs.existsSync(source)) throw new Error("Página fonte Estudo por Cargo ausente.");
for (const relative of ["assets/estudo-por-cargo-v1.js", "assets/estudo-por-cargo-v1.css"]) {
  if (!fs.existsSync(path.join(dist, relative))) throw new Error(`Artefato do Estudo por Cargo ausente: ${relative}.`);
}

fs.copyFileSync(source, target);
if (!fs.readFileSync(source).equals(fs.readFileSync(target))) throw new Error("Página Estudo por Cargo divergiu da fonte durante a publicação.");
console.log("✓ Página filha Estudo por Cargo publicada no artefato sem criar um segundo motor de questões.");
