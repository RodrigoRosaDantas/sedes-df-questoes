import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex");

const index = read("index.html");
const loader = read("assets/bundle-fetch.js");
const app = read("assets/app.js");
const catalog = JSON.parse(read("data/catalogo.json"));
const manifest = JSON.parse(read("data/export-manifest.json"));

const loaderPosition = index.indexOf("assets/bundle-fetch.js");
const appPosition = index.indexOf("assets/app.js");
if (loaderPosition < 0 || appPosition < 0 || loaderPosition > appPosition) fail("Carregador do bundle deve aparecer antes da aplicação.");
if (!loader.includes("length: 12")) fail("Carregador não está configurado para 12 fragmentos.");
if (!app.includes('const CATALOG_URL = "./data/catalogo.json"')) fail("Aplicação não referencia o catálogo publicado.");
if (catalog.bundle_chunks.length !== 12) fail("Catálogo deve referenciar 12 fragmentos.");

const encoded = catalog.bundle_chunks.map(relative => read(relative.replace(/^\.\//, "")).trim()).join("");
const encodedBuffer = Buffer.from(encoded);
const decoded = zlib.gunzipSync(Buffer.from(encoded, "base64"));
const bundle = JSON.parse(decoded.toString("utf8"));
if (sha256(encodedBuffer) !== manifest.release.encoded_bundle_sha256) fail("Hash do bundle codificado divergente.");
if (sha256(decoded) !== manifest.release.decoded_bundle_sha256) fail("Hash do bundle descompactado divergente.");
if (bundle.materials.length !== 9 || bundle.materials.reduce((sum, material) => sum + material.questoes.length, 0) !== 180) fail("Smoke test encontrou totais inesperados.");
for (const chunk of manifest.chunks) {
  const bytes = fs.readFileSync(path.join(root, chunk.path.replace(/^\.\//, "")));
  if (bytes.length !== chunk.bytes || sha256(bytes) !== chunk.sha256) fail(`Integridade divergente: ${chunk.path}`);
}
console.log("✓ Integração válida: scripts ordenados, 12 fragmentos íntegros e 180 questões descompactadas.");
