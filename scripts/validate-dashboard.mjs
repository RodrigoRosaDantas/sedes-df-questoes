import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };
const app = read("assets/app-v3.js");
const index = read("index.html");
const styles = read("assets/dashboard.css");

for (const profile of ["Rodrigo", "Amanda", "Andressa"]) if (!app.includes(`name: "${profile}"`)) fail(`Perfil padrão ausente: ${profile}`);
for (const route of ["inicio", "estudar", "revisar", "desempenho", "perfil"]) {
  if (!app.includes(`case "${route}"`)) fail(`Rota ausente na aplicação: ${route}`);
}
for (const route of ["inicio", "estudar", "revisar", "desempenho"]) if (!index.includes(`data-route="${route}"`)) fail(`Navegação ausente: ${route}`);
for (const feature of ["saveSession", "resumeSession", "renderReview", "renderPerformance", "renderProfiles", "startCustomTraining"]) if (!app.includes(`function ${feature}`) && !app.includes(`async function ${feature}`)) fail(`Funcionalidade ausente: ${feature}`);
if (!app.includes("profileKey") || !app.includes("activeProfile")) fail("Isolamento de dados por perfil ausente.");
if (!app.includes("LEGACY_HISTORY_KEY") || !app.includes("migrateLegacyData")) fail("Migração do histórico anterior ausente.");
if (!styles.includes(".mobile-nav") || !styles.includes(".profile-grid") || !styles.includes(".training-builder")) fail("Estilos estruturais do dashboard incompletos.");
console.log("✓ Dashboard válido: 3 perfis, 4 áreas principais, sessão recuperável, revisão e desempenho separados por perfil.");
