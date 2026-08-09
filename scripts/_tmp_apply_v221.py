from pathlib import Path

p=Path('assets/home-study-subjects-v2-17-stable.js')
s=p.read_text()
s=s.replace('return `<section class="ux20-format" data-ux20-format aria-label="Formato das questões">', 'return `<section class="ux20-format" data-ux20-format aria-label="Formato das questões" aria-busy="${questionFormatIndex ? "false" : "true"}">')
needle='function syncSubjectGroup(card, trackId) {'
insert='''function syncSubjectCounts(card) {\n  const formatMode = readFormatSelection();\n  for (const track of TRACKS) {\n    const group = card.querySelector(`[data-ux17-subject-group="${CSS.escape(track.id)}"]`);\n    if (!group) continue;\n    const options = new Map(subjectOptions(track).map(option => [option.name, option]));\n    group.querySelectorAll("[data-ux17-subject-button]").forEach(button => {\n      const option = options.get(button.dataset.ux17Subject);\n      const count = option ? applyQuestionFormat(option.ids, formatMode).length : 0;\n      const node = button.querySelector("small");\n      if (node) node.textContent = count.toLocaleString("pt-BR");\n    });\n  }\n}\n\nfunction syncDerivedState(card) {\n  const formatPanelNode = card.querySelector("[data-ux20-format]");\n  if (formatPanelNode) formatPanelNode.setAttribute("aria-busy", questionFormatIndex ? "false" : "true");\n  syncFormatControls(card);\n  syncSubjectCounts(card);\n  updateSummary(card);\n}\n\nfunction syncSubjectGroup(card, trackId) {'''
if needle not in s: raise SystemExit('syncSubjectGroup marker missing')
s=s.replace(needle, insert, 1)
s=s.replace('''    saveFormatSelection(button.dataset.ux20FormatOption);\n    renderSubjects(card);''','''    saveFormatSelection(button.dataset.ux20FormatOption);\n    syncDerivedState(card);''')
old='''  const names = pools.map(pool => `${pool.track.label} (${pool.allMode ? "todas" : `${pool.names.length} matérias`})`).join(" + ");\n  const uniqueSubjects = [...new Set(pools.flatMap(pool => pool.names))];\n  const activeTracks = pools.filter(pool => pool.ids.length).map(pool => pool.track);'''
new='''  const activePools = pools.filter(pool => pool.ids.length);\n  const names = activePools.map(pool => `${pool.track.label} (${pool.allMode ? "todas" : `${pool.names.length} matérias`})`).join(" + ");\n  const uniqueSubjects = [...new Set(activePools.flatMap(pool => pool.names))];\n  const activeTracks = activePools.map(pool => pool.track);'''
if old not in s: raise SystemExit('session metadata marker missing')
s=s.replace(old,new,1)
s=s.replace('cargo: pools.length === 1 ? pools[0].track.target : "multicargo",','cargo: activePools.length === 1 ? activePools[0].track.target : "multicargo",',1)
old='''function refreshAfterFormatIndex() {\n  if (formatRetryTimer) {\n    window.clearTimeout(formatRetryTimer);\n    formatRetryTimer = null;\n  }\n  const card = document.querySelector("#app > [data-ux15-home] [data-ux-today][data-ux16-ready]");\n  if (card) renderSubjects(card);\n}\n\nfunction loadFormatIndexAndRefresh() {\n  ensureQuestionFormatIndex()\n    .then(refreshAfterFormatIndex)\n    .catch(error => {\n      console.error("Falha temporária ao carregar formatos do Estudo de hoje v2.20:", error);\n      if (!formatRetryTimer) formatRetryTimer = window.setTimeout(() => {\n        formatRetryTimer = null;\n        loadFormatIndexAndRefresh();\n      }, 1200);\n    });\n}\n\nwindow.addEventListener("hashchange", () => window.setTimeout(arm, 120));\nensureData()\n  .then(() => {\n    window.setTimeout(arm, 120);\n    loadFormatIndexAndRefresh();\n  })\n  .catch(error => console.error("Falha ao preparar matérias do Estudo de hoje v2.20:", error));'''
new='''function stopFormatRetry() {\n  if (!formatRetryTimer) return;\n  window.clearTimeout(formatRetryTimer);\n  formatRetryTimer = null;\n}\n\nfunction refreshAfterFormatIndex() {\n  stopFormatRetry();\n  const card = document.querySelector("#app > [data-ux15-home] [data-ux-today][data-ux16-ready]");\n  if (card) syncDerivedState(card);\n}\n\nfunction loadFormatIndexAndRefresh() {\n  if (currentRoute() !== "inicio" || questionFormatIndex) return;\n  ensureQuestionFormatIndex()\n    .then(refreshAfterFormatIndex)\n    .catch(error => {\n      console.error("Falha temporária ao carregar formatos do Estudo de hoje v2.21:", error);\n      if (currentRoute() !== "inicio") {\n        stopFormatRetry();\n        return;\n      }\n      if (!formatRetryTimer) formatRetryTimer = window.setTimeout(() => {\n        formatRetryTimer = null;\n        loadFormatIndexAndRefresh();\n      }, 1200);\n    });\n}\n\nwindow.addEventListener("hashchange", () => {\n  if (currentRoute() !== "inicio") stopFormatRetry();\n  window.setTimeout(() => {\n    arm();\n    if (currentRoute() === "inicio" && !questionFormatIndex) loadFormatIndexAndRefresh();\n  }, 120);\n});\nensureData()\n  .then(() => {\n    window.setTimeout(arm, 120);\n    loadFormatIndexAndRefresh();\n  })\n  .catch(error => console.error("Falha ao preparar matérias do Estudo de hoje v2.21:", error));'''
if old not in s: raise SystemExit('format refresh tail missing')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('index.html'); s=p.read_text()
s=s.replace('<html lang="pt-BR" data-theme="dark" data-ux20-format-gate="loading">','<html lang="pt-BR" data-theme="dark">')
s=s.replace('  <link rel="stylesheet" href="./assets/home-question-format-v2-20-hotfix.css?v=1">\n','')
s=s.replace('  <script type="module" src="./assets/home-question-format-v2-20-hotfix.js?v=1"></script>\n','')
s=s.replace('home-study-subjects-v2-17.css?v=6','home-study-subjects-v2-17.css?v=7')
s=s.replace('home-study-subjects-v2-17-stable.js?v=6','home-study-subjects-v2-17-stable.js?v=7')
p.write_text(s)

p=Path('service-worker.js'); s=p.read_text()
s=s.replace('"./assets/home-study-subjects-v2-17.css?v=6", "./assets/home-question-format-v2-20-hotfix.css?v=1",','"./assets/home-study-subjects-v2-17.css?v=7",')
s=s.replace('"./assets/home-study-subjects-v2-17-stable.js?v=6", "./assets/home-question-format-v2-20-hotfix.js?v=1",','"./assets/home-study-subjects-v2-17-stable.js?v=7",')
s=s.replace('home-study-subjects-v2-17.css?v=6','home-study-subjects-v2-17.css?v=7')
s=s.replace('home-study-subjects-v2-17-stable.js?v=6','home-study-subjects-v2-17-stable.js?v=7')
p.write_text(s)

for old in ['assets/home-question-format-v2-20-hotfix.js','assets/home-question-format-v2-20-hotfix.css']:
    Path(old).unlink(missing_ok=True)

Path('scripts/validate-home-question-format-v2-20.mjs').write_text(r'''import fs from "node:fs";
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("assets/home-study-subjects-v2-17-stable.js");
const css = read("assets/home-study-subjects-v2-17.css");
const index = read("index.html");
const worker = read("service-worker.js");
const builder = read("scripts/build-question-search-index.mjs");
const publicConfig = read("playwright.public.config.js");
const requireText = (text, pattern, message) => { if (!pattern.test(text)) throw new Error(message); };
const rejectText = (text, pattern, message) => { if (pattern.test(text)) throw new Error(message); };
requireText(index, /home-study-subjects-v2-17\.css\?v=7/, "CSS v2.21 precisa de cache-bust v7.");
requireText(index, /home-study-subjects-v2-17-stable\.js\?v=7/, "JS v2.21 precisa de cache-bust v7.");
requireText(worker, /home-study-subjects-v2-17\.css\?v=7/, "CSS v2.21 precisa estar no shell PWA.");
requireText(worker, /home-study-subjects-v2-17-stable\.js\?v=7/, "JS v2.21 precisa estar no shell PWA.");
requireText(worker, /question-format-index/, "Índice de formato precisa continuar network-first/pré-cacheado.");
requireText(builder, /question-format-index\.json/, "Build precisa gerar o índice de formato por questão.");
requireText(builder, /alternatives\.length === 2.*tokens\.has\("certo"\).*tokens\.has\("errado"\)/s, "Classificação C/E precisa usar estrutura real.");
requireText(builder, /alternatives\.length >= 2.*multiple-choice/s, "Classificação de múltipla escolha ausente.");
requireText(builder, /missingFormats/, "Índice de formato precisa manter identidade 1:1.");
requireText(home, /aria-busy="\$\{questionFormatIndex \? "false" : "true"\}"/, "Painel de formato deve expor carregamento acessível.");
requireText(home, /function syncSubjectCounts/, "Atualização in-place das contagens das matérias ausente.");
requireText(home, /function syncDerivedState/, "Sincronização derivada v2.21 ausente.");
requireText(home, /saveFormatSelection\([\s\S]*syncDerivedState\(card\)/, "Mudança de formato não pode reconstruir o painel.");
requireText(home, /function refreshAfterFormatIndex\([\s\S]*syncDerivedState\(card\)/, "Chegada do índice deve sincronizar in-place.");
rejectText(home, /function refreshAfterFormatIndex\([\s\S]{0,300}renderSubjects\(card\)/, "Chegada do índice ainda reconstrói o painel.");
requireText(home, /const activePools = pools\.filter\(pool => pool\.ids\.length\)/, "Metadados precisam considerar apenas recortes contribuintes.");
requireText(home, /cargo: activePools\.length === 1 \? activePools\[0\]\.track\.target : "multicargo"/, "Cargo da sessão precisa derivar dos recortes ativos.");
requireText(home, /function stopFormatRetry/, "Retry do índice precisa ser cancelável.");
requireText(home, /currentRoute\(\) !== "inicio"[\s\S]*stopFormatRetry/, "Retry precisa parar fora da Home.");
rejectText(index, /data-ux20-format-gate/, "Gate global antigo não pode permanecer no HTML.");
rejectText(index, /home-question-format-v2-20-hotfix/, "Assets do hotfix antigo não podem permanecer conectados.");
rejectText(worker, /home-question-format-v2-20-hotfix/, "Hotfix antigo não pode permanecer no shell PWA.");
requireText(home, /Começar com estes filtros/, "CTA deve refletir os filtros combinados.");
requireText(css, /ux20-format-option/, "Estilos do filtro de formato ausentes.");
requireText(css, /min-height:42px/, "Filtro precisa manter alvo de toque adequado.");
requireText(publicConfig, /home-question-format-v2-21\.spec\.js/, "Regressão pública v2.21 precisa estar allowlisted.");
const distIndex = new URL("../dist/data/release/question-format-index.json", import.meta.url);
if (fs.existsSync(distIndex)) {
  const payload = JSON.parse(fs.readFileSync(distIndex, "utf8"));
  const formats = payload.formats || {};
  if (Number(payload.question_count) !== 3447 || Object.keys(formats).length !== 3447) throw new Error("Índice de formato não cobre as 3.447 questões.");
  if (Number(payload.summary?.["true-false"]) !== 2538 || Number(payload.summary?.["multiple-choice"]) !== 909) throw new Error("Partição esperada é 2.538 C/E + 909 múltipla escolha.");
}
console.log("✓ Filtro v2.21: sem rerender concorrente, recuperação acessível e metadados por recortes ativos.");
''')

Path('scripts/validate-home-question-format-v2-20-gate.mjs').write_text(r'''import fs from "node:fs";
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("index.html");
const worker = read("service-worker.js");
const home = read("assets/home-study-subjects-v2-17-stable.js");
const requireText = (text, pattern, message) => { if (!pattern.test(text)) throw new Error(message); };
const rejectText = (text, pattern, message) => { if (pattern.test(text)) throw new Error(message); };
rejectText(index, /data-ux20-format-gate/, "Gate global antigo precisa ser removido.");
rejectText(index, /home-question-format-v2-20-hotfix/, "HTML ainda referencia hotfix antigo.");
rejectText(worker, /home-question-format-v2-20-hotfix/, "PWA ainda referencia hotfix antigo.");
rejectText(home, /setInterval\(check, 50\)/, "Polling de 50 ms não pode existir.");
requireText(worker, /\.\/data\/release\/question-format-index\.json/, "Índice de formato deve continuar no shell PWA.");
requireText(home, /aria-busy/, "Carregamento do formato precisa ser acessível sem bloquear matérias.");
requireText(home, /button\.disabled = mode !== "all" && \(!questionFormatIndex \|\| counts\[mode\] === 0\)/, "Somente formatos dependentes do índice devem ficar desabilitados.");
requireText(home, /syncSubjectCounts\(card\)/, "Contagens devem atualizar in-place.");
requireText(home, /stopFormatRetry\(\)/, "Retry precisa ser cancelado ao sair da Home.");
console.log("✓ Resiliência v2.21: sem gate global, sem polling de 50 ms e sem bloqueio das matérias.");
''')

Path('tests/home-question-format-v2-21.spec.js').write_text(r'''import {test, expect} from "@playwright/test";
const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";
async function seed(page, tracks = ["prova-202"]) {
  await page.addInitScript(({trackKey, subjectKey, formatKey, sessionKey, tracks}) => {
    localStorage.setItem(trackKey, JSON.stringify(tracks));
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(subjectKey);
    sessionStorage.removeItem(formatKey);
  }, {trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY, tracks});
}
async function openHome(page) {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
}
test("Limpar → recarregar → Todas nunca bloqueia a recuperação", async ({page}) => {
  await seed(page); await openHome(page);
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  await group.locator('[data-ux17-clear="prova-202"]').click();
  await expect(group.locator('[data-ux17-subject-status]')).toContainText("0 de");
  await page.reload({waitUntil: "domcontentloaded"});
  const reloaded = page.locator('[data-ux17-subject-group="prova-202"]');
  await reloaded.locator("summary").click();
  const all = reloaded.locator('[data-ux17-all="prova-202"]');
  await expect(all).toBeEnabled(); await all.click();
  await expect(reloaded.locator('[data-ux17-subject-status]')).toContainText("Todas");
  await expect(page.locator('[data-ux17-start]')).toBeEnabled();
  await expect(page.locator("html")).not.toHaveAttribute("data-ux20-format-gate", /.+/);
});
test("matérias continuam acessíveis por teclado enquanto o índice chega", async ({page}) => {
  let releaseIndex, markRequested;
  const gate = new Promise(resolve => { releaseIndex = resolve; });
  const requested = new Promise(resolve => { markRequested = resolve; });
  await page.route("**/data/release/question-format-index.json", async route => { markRequested(); await gate; await route.continue(); });
  await seed(page); await openHome(page); await requested;
  const panel = page.locator("[data-ux20-format]");
  await expect(panel).toHaveAttribute("aria-busy", "true");
  await expect(panel.locator('[data-ux20-format-option="true-false"]')).toBeDisabled();
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const chip = group.locator('[data-ux17-subject-button]').first();
  const subject = await chip.getAttribute('data-ux17-subject');
  await chip.focus(); await page.keyboard.press("Enter");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await group.evaluate(node => node.dataset.v221Sentinel = "keep");
  releaseIndex();
  await expect(panel).toHaveAttribute("aria-busy", "false", {timeout: 30000});
  await expect(panel.locator('[data-ux20-format-option="true-false"]')).toBeEnabled();
  await expect(group).toHaveAttribute("data-v221-sentinel", "keep");
  await expect(group.locator('[data-ux17-subject-button][aria-pressed="true"]')).toHaveAttribute('data-ux17-subject', subject);
});
test("falha do índice não impede estudar em Todas", async ({page}) => {
  await page.route("**/data/release/question-format-index.json", route => route.abort("failed"));
  await seed(page); await openHome(page);
  const panel = page.locator("[data-ux20-format]");
  await expect(panel.locator('[data-ux20-format-option="all"]')).toBeEnabled();
  await expect(panel.locator('[data-ux20-format-option="true-false"]')).toBeDisabled();
  const group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click();
  const chip = group.locator('[data-ux17-subject-button]').first();
  await chip.click(); await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-ux17-start]')).toBeEnabled();
  await page.locator('[data-ux17-start]').click();
  await page.waitForURL(/#\/resolver/, {timeout: 30000});
  const session = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
  expect(session?.questionIds?.length).toBeGreaterThan(0);
});
''')

Path('tests-public/home-question-format-v2-21.spec.js').write_text(r'''import {test, expect} from "@playwright/test";
const TRACK_KEY = "sedes.questoes.rodrigo.homeStudyToday.v2";
const SUBJECT_KEY = "sedes.questoes.rodrigo.homeStudySubjects.v2";
const FORMAT_KEY = "sedes.questoes.rodrigo.homeStudyFormat.v1";
const SESSION_KEY = "sedes.questoes.rodrigo.session.v3";
test("site público recupera seleção após Limpar e recarregar sem gate global", async ({page}) => {
  await page.goto("./#/inicio", {waitUntil: "domcontentloaded"});
  await page.evaluate(({trackKey, subjectKey, formatKey, sessionKey}) => {
    localStorage.setItem(trackKey, JSON.stringify(["prova-202"])); localStorage.removeItem(sessionKey); sessionStorage.removeItem(subjectKey); sessionStorage.removeItem(formatKey);
  }, {trackKey: TRACK_KEY, subjectKey: SUBJECT_KEY, formatKey: FORMAT_KEY, sessionKey: SESSION_KEY});
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
  expect(await page.locator('script[src*="home-question-format-v2-20-hotfix"]').count()).toBe(0);
  expect(await page.locator('link[href*="home-question-format-v2-20-hotfix"]').count()).toBe(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-ux20-format-gate", /.+/);
  let group = page.locator('[data-ux17-subject-group="prova-202"]');
  await group.locator("summary").click(); await group.locator('[data-ux17-clear="prova-202"]').click();
  await page.reload({waitUntil: "domcontentloaded"});
  await expect(page.locator("[data-ux20-format]")).toBeVisible({timeout: 30000});
  group = page.locator('[data-ux17-subject-group="prova-202"]'); await group.locator("summary").click();
  const all = group.locator('[data-ux17-all="prova-202"]'); await expect(all).toBeEnabled(); await all.click();
  await expect(group.locator('[data-ux17-subject-status]')).toContainText("Todas"); await expect(page.locator('[data-ux17-start]')).toBeEnabled();
});
''')

p=Path('playwright.public.config.js'); s=p.read_text(); marker='    "home-question-format-v2-20.spec.js",\n'
if 'home-question-format-v2-21.spec.js' not in s:
    if marker not in s: raise SystemExit('public config marker missing')
    s=s.replace(marker, marker+'    "home-question-format-v2-21.spec.js",\n')
p.write_text(s)

Path('.github/workflows/_tmp_apply_v221.yml').unlink(missing_ok=True)
Path('scripts/_tmp_apply_v221.py').unlink(missing_ok=True)
