import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const fail = message => { throw new Error(message); };
const app = read("assets/app-v3.js");
const index = read("index.html");
const styles = read("assets/dashboard.css");
const uxScript = read("assets/ux-improvements.js");
const uxStyles = read("assets/ux-improvements.css");
const exam = JSON.parse(read("data/concurso.json"));

for (const profile of ["Rodrigo", "Amanda", "Andressa"]) if (!app.includes(`name: "${profile}"`)) fail(`Perfil padrão ausente: ${profile}`);
for (const route of ["inicio", "estudar", "revisar", "desempenho", "perfil"]) {
  if (!app.includes(`case "${route}"`)) fail(`Rota ausente na aplicação: ${route}`);
}
for (const route of ["inicio", "estudar", "revisar", "desempenho"]) if (!index.includes(`data-route="${route}"`)) fail(`Navegação ausente: ${route}`);
for (const feature of ["saveSession", "resumeSession", "renderReview", "renderPerformance", "renderProfiles", "startCustomTraining"]) if (!app.includes(`function ${feature}`) && !app.includes(`async function ${feature}`)) fail(`Funcionalidade ausente: ${feature}`);
if (!app.includes("profileKey") || !app.includes("activeProfile")) fail("Isolamento de dados por perfil ausente.");
if (!app.includes("LEGACY_HISTORY_KEY") || !app.includes("migrateLegacyData")) fail("Migração do histórico anterior ausente.");
if (!styles.includes(".mobile-nav") || !styles.includes(".profile-grid") || !styles.includes(".training-builder")) fail("Estilos estruturais do dashboard incompletos.");
if (!index.includes("assets/ux-improvements.js") || !index.includes("assets/ux-improvements.css")) fail("Camada de melhorias de UX não está referenciada.");
if (index.includes("assets/cargo-filter.js")) fail("O filtro legado de cargos não deve permanecer ativo.");
if (!uxScript.includes("studyLevel.v1") || !uxScript.includes("builder-level")) fail("Filtro principal por nível ausente.");
if (!uxScript.includes("profile-role-list") || !uxScript.includes("Cargos prioritários")) fail("Cards simplificados dos perfis ausentes.");
if (!uxScript.includes("Todos os perfis podem acessar todo o acervo")) fail("Regra de acesso livre não está explícita.");
if (!uxScript.includes("Mais filtros") || !uxScript.includes("Cargo específico (opcional)")) fail("Filtros avançados não foram implementados.");
if (!uxStyles.includes(".profile-switcher") || !uxStyles.includes(".advanced-filters")) fail("Estilos das melhorias de UX incompletos.");
const expectedCodes = ["200", "202", "400", "403", "405"];
const codes = exam.cargos.map(role => String(role.codigo)).sort();
if (codes.join(",") !== [...expectedCodes].sort().join(",")) fail(`A plataforma deve manter os cinco códigos oficiais: ${codes.join(", ")}`);
for (const code of expectedCodes) if (!uxScript.includes(`codigo: "${code}"`)) fail(`Cargo ${code} ausente da camada de nível.`);
console.log("✓ Dashboard válido: perfis simplificados, acesso livre, filtro por nível, filtros avançados e quatro áreas principais.");
