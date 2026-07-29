import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };

const assignments = read("assets/profile-defaults.js");
const index = read("index.html");

const expected = [
  ['rodrigo: {id: "rodrigo", name: "Rodrigo", roles: ["202", "400"]}', "Rodrigo: 202 e 400"],
  ['amanda: {id: "amanda", name: "Amanda", roles: ["202", "403"]}', "Amanda: 202 e 403"],
  ['andressa: {id: "andressa", name: "Andressa", roles: ["200", "405"]}', "Andressa: 200 e 405"],
];

for (const [snippet, label] of expected) {
  if (!assignments.includes(snippet)) fail(`Vínculo de perfil divergente: ${label}.`);
}

const defaultsPosition = index.indexOf("assets/profile-defaults.js");
const appPosition = index.indexOf("assets/app-v3.js");
if (defaultsPosition < 0) fail("Script de cargos padrão não está referenciado no HTML.");
if (appPosition < 0) fail("Aplicação principal não está referenciada no HTML.");
if (defaultsPosition > appPosition) fail("Os cargos padrão devem ser aplicados antes da aplicação principal.");
if (!assignments.includes("ASSIGNMENTS_VERSION_KEY")) fail("Migração versionada dos perfis não foi configurada.");

console.log("✓ Perfis válidos: Rodrigo 202/400, Amanda 202/403 e Andressa 200/405.");
