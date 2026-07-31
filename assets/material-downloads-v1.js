const MATERIAL_KEY = "sedes.questoes.activeMaterialForExport.v1";
const CATALOG_URL = "./data/release/catalogo.json";
const materialCache = new Map();
let catalogPromise = null;
let injectionPending = false;

const clean = value => String(value ?? "").trim();
const escapeHTML = value => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const paragraphs = value => escapeHTML(value).replace(/\r?\n/g, "<br>");
const slug = value => clean(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "material";

function rememberMaterial(event) {
  const button = event.target.closest("[data-open-material]");
  const id = clean(button?.dataset.openMaterial);
  if (id) sessionStorage.setItem(MATERIAL_KEY, id);
}

document.addEventListener("click", rememberMaterial, true);

async function loadCatalog() {
  catalogPromise ||= fetch(CATALOG_URL, {cache: "no-store"}).then(response => {
    if (!response.ok) throw new Error(`Catálogo indisponível: HTTP ${response.status}.`);
    return response.json();
  });
  return catalogPromise;
}

async function loadMaterial(id) {
  if (materialCache.has(id)) return materialCache.get(id);
  const catalog = await loadCatalog();
  const meta = (catalog.materials || []).find(item => clean(item.id) === id);
  if (!meta?.file) throw new Error("Material não localizado no catálogo público.");
  const url = new URL(clean(meta.file).replace(/^\.\//, ""), document.baseURI);
  const response = await fetch(url, {cache: "no-store"});
  if (!response.ok) throw new Error(`Material indisponível: HTTP ${response.status}.`);
  const material = await response.json();
  if (!Array.isArray(material.questoes)) throw new Error("O arquivo do material não contém questões válidas.");
  materialCache.set(id, material);
  return material;
}

function optionEntries(question) {
  const alternatives = question?.alternativas;
  if (Array.isArray(alternatives)) {
    return alternatives.map((text, index) => [String.fromCharCode(65 + index), text]);
  }
  return Object.entries(alternatives || {});
}

function imageSources(question) {
  const candidates = [
    question?.imagem,
    question?.imagem_url,
    question?.image,
    ...(Array.isArray(question?.imagens) ? question.imagens : []),
  ];
  return candidates
    .map(item => typeof item === "string" ? item : item?.url || item?.src)
    .map(clean)
    .filter(Boolean)
    .map(source => {
      try { return new URL(source, document.baseURI).href; }
      catch { return ""; }
    })
    .filter(Boolean);
}

function renderImages(question) {
  const sources = imageSources(question);
  if (!sources.length) return "";
  return `<div class="question-images">${sources.map((source, index) => `<img src="${escapeHTML(source)}" alt="Imagem da questão ${index + 1}">`).join("")}</div>`;
}

function renderAlternatives(question) {
  const entries = optionEntries(question);
  if (!entries.length) return "";
  return `<ol class="alternatives">${entries.map(([label, text]) => {
    const normalizedLabel = clean(label);
    const normalizedText = clean(text);
    const display = normalizedText === normalizedLabel && ["Certo", "Errado"].includes(normalizedLabel)
      ? normalizedLabel
      : `<strong>${escapeHTML(normalizedLabel)})</strong> ${paragraphs(normalizedText)}`;
    return `<li>${display}</li>`;
  }).join("")}</ol>`;
}

function renderQuestion(question, index) {
  const number = clean(question?.numero) || index + 1;
  const code = clean(question?.codigo || question?.codigo_fonte);
  return `<article class="question">
    <header><h2>Questão ${escapeHTML(number)}</h2>${code ? `<small>${escapeHTML(code)}</small>` : ""}</header>
    ${question?.texto_base ? `<div class="text-base">${paragraphs(question.texto_base)}</div>` : ""}
    <div class="statement">${paragraphs(question?.enunciado || "Enunciado não disponível.")}</div>
    ${renderImages(question)}
    ${renderAlternatives(question)}
  </article>`;
}

function renderAnswerKey(questions) {
  return `<section class="answer-section page-break">
    <h1>Gabarito</h1>
    <div class="answer-grid">${questions.map((question, index) => {
      const number = clean(question?.numero) || index + 1;
      return `<div><span>${escapeHTML(number)}</span><strong>${escapeHTML(question?.gabarito || "—")}</strong></div>`;
    }).join("")}</div>
  </section>`;
}

function renderComments(questions) {
  const items = questions.map((question, index) => {
    const number = clean(question?.numero) || index + 1;
    const blocks = [
      question?.comentario ? `<p><strong>Comentário:</strong> ${paragraphs(question.comentario)}</p>` : "",
      question?.fundamento ? `<p><strong>Fundamento:</strong> ${paragraphs(question.fundamento)}</p>` : "",
      question?.pegadinha ? `<p><strong>Pegadinha:</strong> ${paragraphs(question.pegadinha)}</p>` : "",
    ].filter(Boolean).join("");
    return `<article class="comment"><h2>Questão ${escapeHTML(number)} — ${escapeHTML(question?.gabarito || "—")}</h2>${blocks || "<p>Comentário não disponível.</p>"}</article>`;
  }).join("");
  return `<section class="comments page-break"><h1>Comentários e fundamentos</h1>${items}</section>`;
}

function printableDocument(material, includeAnswers) {
  const questions = material.questoes || [];
  const title = clean(material.nome) || "Material de questões";
  const type = clean(material.tipo_material).toLowerCase() === "prova" ? "Prova anterior" : "Simulado";
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {dateStyle: "long", timeStyle: "short"}).format(new Date());
  const subtitle = includeAnswers ? "Caderno comentado" : "Caderno para responder";
  const content = questions.map(renderQuestion).join("");
  const answers = includeAnswers ? `${renderAnswerKey(questions)}${renderComments(questions)}` : "";
  const filename = `${slug(title)}-${includeAnswers ? "comentado" : "sem-gabarito"}.pdf`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(filename)}</title>
<style>
  :root { font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; line-height: 1.48; font-size: 12pt; }
  .toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 12px; align-items: center; justify-content: space-between; margin: -28px -28px 28px; padding: 12px 20px; background: #0f172a; color: #fff; }
  .toolbar button { border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 700; cursor: pointer; }
  .cover { min-height: 84vh; display: grid; align-content: center; border: 2px solid #0f172a; padding: 48px; }
  .brand { font-size: 14px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .cover h1 { margin: 28px 0 10px; font-size: 28pt; line-height: 1.15; }
  .cover h2 { margin: 0 0 30px; font-size: 17pt; font-weight: 500; }
  .meta { display: grid; gap: 8px; margin-top: 28px; }
  .instructions { margin-top: 40px; border-top: 1px solid #94a3b8; padding-top: 20px; }
  .question { break-inside: avoid; padding: 24px 0; border-bottom: 1px solid #cbd5e1; }
  .question header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
  .question h2, .comment h2 { margin: 0 0 14px; font-size: 15pt; }
  .question small { color: #64748b; font-size: 8pt; }
  .text-base { margin: 12px 0; padding: 14px; border-left: 4px solid #64748b; background: #f8fafc; }
  .statement { margin: 14px 0; font-weight: 600; }
  .alternatives { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 9px; }
  .alternatives li { padding-left: 4px; }
  .question-images { display: grid; gap: 12px; margin: 16px 0; }
  .question-images img { max-width: 100%; max-height: 620px; object-fit: contain; }
  .page-break { break-before: page; }
  .answer-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .answer-grid div { display: flex; justify-content: space-between; gap: 8px; border: 1px solid #cbd5e1; padding: 8px; }
  .comment { break-inside: avoid; padding: 18px 0; border-bottom: 1px solid #cbd5e1; }
  .comment p { margin: 8px 0; }
  footer { margin-top: 30px; color: #64748b; font-size: 9pt; text-align: center; }
  @page { size: A4; margin: 16mm; }
  @media print {
    body { padding: 0; }
    .toolbar { display: none !important; }
    .cover { min-height: 250mm; }
  }
  @media (max-width: 640px) {
    body { padding: 16px; }
    .toolbar { margin: -16px -16px 18px; align-items: flex-start; }
    .cover { min-height: auto; padding: 28px; }
    .answer-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>
  <div class="toolbar"><span>Na tela de impressão, escolha <strong>Salvar como PDF</strong>.</span><button type="button" onclick="window.print()">Imprimir / salvar PDF</button></div>
  <section class="cover">
    <div class="brand">SEDES/DF Questões</div>
    <h1>${escapeHTML(title)}</h1>
    <h2>${escapeHTML(subtitle)}</h2>
    <div class="meta">
      <div><strong>Tipo:</strong> ${escapeHTML(type)}</div>
      <div><strong>Disciplina:</strong> ${escapeHTML(material.disciplina || "Não informada")}</div>
      <div><strong>Fonte:</strong> ${escapeHTML(material.fonte || "Banco Mestre")}</div>
      <div><strong>Ano:</strong> ${escapeHTML(material.ano || "—")}</div>
      <div><strong>Quantidade:</strong> ${questions.length} questões</div>
    </div>
    <div class="instructions"><strong>Orientação:</strong> use a opção “Salvar como PDF” da impressão do navegador para baixar o arquivo.</div>
  </section>
  <main>${content}</main>
  ${answers}
  <footer>Gerado em ${escapeHTML(generatedAt)} a partir da versão publicada na Plataforma SEDES/DF Questões.</footer>
<script>document.title = ${JSON.stringify(filename)}; setTimeout(() => window.print(), 650);<\/script>
</body>
</html>`;
}

function writeLoading(popup) {
  popup.document.open();
  popup.document.write("<!doctype html><html lang='pt-BR'><meta charset='utf-8'><title>Gerando caderno…</title><body style='font-family:Arial;padding:32px'><h1>Gerando caderno…</h1><p>Aguarde enquanto o material publicado é preparado.</p></body></html>");
  popup.document.close();
}

async function exportMaterial(includeAnswers) {
  const id = clean(sessionStorage.getItem(MATERIAL_KEY));
  if (!id) {
    alert("Não foi possível identificar o material aberto. Volte à lista e abra-o novamente.");
    return;
  }

  const popup = window.open("", "_blank");
  if (!popup) {
    alert("O navegador bloqueou a janela de geração. Libere pop-ups para este site e tente novamente.");
    return;
  }
  popup.opener = null;
  writeLoading(popup);

  try {
    const material = await loadMaterial(id);
    popup.document.open();
    popup.document.write(printableDocument(material, includeAnswers));
    popup.document.close();
    popup.focus();
  } catch (error) {
    console.error(error);
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Falha ao gerar</title><body style="font-family:Arial;padding:32px"><h1>Não foi possível gerar o caderno.</h1><p>${escapeHTML(error.message)}</p><button onclick="window.close()">Fechar</button></body></html>`);
    popup.document.close();
  }
}

function injectDownloadCard() {
  if (injectionPending) return;
  const grid = document.querySelector(".mode-grid");
  if (!grid || grid.querySelector("[data-material-download-card]")) return;
  const id = clean(sessionStorage.getItem(MATERIAL_KEY));
  if (!id) return;

  injectionPending = true;
  const card = document.createElement("article");
  card.className = "mode-card card material-download-card";
  card.dataset.materialDownloadCard = "";
  card.innerHTML = `<span class="mode-icon" aria-hidden="true">⇩</span>
    <div><p class="eyebrow">Estudo offline</p><h2>Baixar material em PDF</h2><p>Gere o caderno para responder ou a versão completa com gabarito e comentários.</p></div>
    <div class="material-download-actions">
      <button class="btn primary" type="button" data-export-material="questions">PDF para responder</button>
      <button class="btn" type="button" data-export-material="answers">PDF comentado</button>
    </div>`;
  grid.append(card);
  card.querySelector('[data-export-material="questions"]').addEventListener("click", () => exportMaterial(false));
  card.querySelector('[data-export-material="answers"]').addEventListener("click", () => exportMaterial(true));
  injectionPending = false;
}

const app = document.querySelector("#app");
if (app) {
  new MutationObserver(injectDownloadCard).observe(app, {childList: true, subtree: true});
  injectDownloadCard();
}
