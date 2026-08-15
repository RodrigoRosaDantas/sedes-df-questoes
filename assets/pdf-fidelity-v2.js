import {toast} from "./shared-v2-13.js?v=1";

const MATERIAL_KEY = "sedes.questoes.activeMaterialForExport.v1";
const CATALOG_URL = "./data/release/catalogo.json";
const PAGE = Object.freeze({width: 1240, height: 1754, margin: 88});
const FONT = 'Arial, "Noto Sans", sans-serif';
let catalogPromise = null;

const clean = value => String(value ?? "").trim();
const slug = value => clean(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "material";
const encodeAscii = value => new TextEncoder().encode(value);
const concatBytes = chunks => {
  const size = chunks.reduce((sum, item) => sum + item.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const item of chunks) { output.set(item, offset); offset += item.length; }
  return output;
};

async function loadMaterial() {
  const id = clean(sessionStorage.getItem(MATERIAL_KEY));
  if (!id) throw new Error("Material não identificado. Volte à lista e abra-o novamente.");
  catalogPromise ||= fetch(CATALOG_URL, {cache: "no-store"}).then(response => {
    if (!response.ok) throw new Error(`Catálogo indisponível: HTTP ${response.status}.`);
    return response.json();
  });
  const catalog = await catalogPromise;
  const meta = (catalog.materials || []).find(item => clean(item.id) === id);
  if (!meta?.file) throw new Error("Material não localizado no catálogo.");
  const response = await fetch(new URL(clean(meta.file).replace(/^\.\//, ""), document.baseURI), {cache: "no-store"});
  if (!response.ok) throw new Error(`Material indisponível: HTTP ${response.status}.`);
  return response.json();
}

function questionImages(question) {
  const raw = [question?.imagem, question?.imagem_url, question?.image, ...(Array.isArray(question?.imagens) ? question.imagens : [])];
  const values = [];
  for (const item of raw) {
    if (!item) continue;
    const source = typeof item === "string" ? item : (item.url || item.src || item.path || item.file || "");
    if (source && !values.includes(source)) values.push(source);
  }
  return values;
}

async function loadImage(source) {
  const image = new Image();
  image.decoding = "async";
  image.src = new URL(clean(source), document.baseURI).toString();
  await image.decode();
  return image;
}

class PageRenderer {
  constructor() {
    this.pages = [];
    this.newPage();
  }
  newPage() {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE.width;
    canvas.height = PAGE.height;
    const ctx = canvas.getContext("2d", {alpha: false});
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE.width, PAGE.height);
    ctx.fillStyle = "#111111";
    ctx.textBaseline = "top";
    this.canvas = canvas;
    this.ctx = ctx;
    this.y = PAGE.margin;
    this.pages.push(canvas);
  }
  font(size = 26, bold = false) {
    this.ctx.font = `${bold ? 700 : 400} ${size}px ${FONT}`;
  }
  ensure(height) {
    if (this.y + height <= PAGE.height - PAGE.margin) return;
    this.newPage();
  }
  lines(text, maxWidth, size = 26, bold = false) {
    this.font(size, bold);
    const output = [];
    for (const paragraph of String(text ?? "").split(/\r?\n/)) {
      if (!paragraph.trim()) { output.push(""); continue; }
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || this.ctx.measureText(candidate).width <= maxWidth) line = candidate;
        else { output.push(line); line = word; }
      }
      if (line) output.push(line);
    }
    return output;
  }
  text(value, {size = 26, bold = false, indent = 0, after = 10} = {}) {
    const maxWidth = PAGE.width - PAGE.margin * 2 - indent;
    const lineHeight = Math.round(size * 1.34);
    const lines = this.lines(value, maxWidth, size, bold);
    for (const line of lines) {
      this.ensure(lineHeight + after);
      this.font(size, bold);
      this.ctx.fillStyle = "#111111";
      if (line) this.ctx.fillText(line, PAGE.margin + indent, this.y);
      this.y += lineHeight;
    }
    this.y += after;
  }
  divider() {
    this.ensure(30);
    this.ctx.strokeStyle = "#d7d7d7";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(PAGE.margin, this.y + 4);
    this.ctx.lineTo(PAGE.width - PAGE.margin, this.y + 4);
    this.ctx.stroke();
    this.y += 26;
  }
  async image(source) {
    let image;
    try { image = await loadImage(source); }
    catch (error) { console.warn("Imagem não pôde ser renderizada no PDF fiel:", source, error); return false; }
    const maxWidth = PAGE.width - PAGE.margin * 2;
    const maxHeight = PAGE.height - PAGE.margin * 2;
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1.5);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    this.ensure(height + 24);
    const x = PAGE.margin + Math.max(0, (maxWidth - width) / 2);
    this.ctx.drawImage(image, x, this.y, width, height);
    this.y += height + 24;
    return true;
  }
}

function alternatives(question) {
  if (Array.isArray(question?.alternativas)) return question.alternativas.map((text, index) => [String.fromCharCode(65 + index), text]);
  return Object.entries(question?.alternativas || {});
}

async function renderMaterial(material, includeAnswers) {
  const renderer = new PageRenderer();
  const questions = Array.isArray(material.questoes) ? material.questoes : [];
  renderer.text(clean(material.nome) || "Material de questões", {size: 38, bold: true, after: 14});
  renderer.text(includeAnswers ? "Caderno comentado" : "Caderno para responder", {size: 28, bold: true, after: 16});
  renderer.text(`Disciplina: ${clean(material.disciplina) || "Não informada"}`, {size: 23, after: 4});
  renderer.text(`Fonte: ${clean(material.fonte) || "Banco Mestre"}`, {size: 23, after: 4});
  renderer.text(`Quantidade: ${questions.length} questões`, {size: 23, after: 22});
  renderer.divider();

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index] || {};
    const number = clean(question.numero) || index + 1;
    renderer.text(`Questão ${number}${question.codigo ? ` — ${clean(question.codigo)}` : ""}`, {size: 29, bold: true, after: 12});
    if (question.texto_base) renderer.text(question.texto_base, {size: 25, after: 13});
    renderer.text(question.enunciado || "Enunciado não disponível.", {size: 26, bold: false, after: 14});
    for (const source of questionImages(question)) await renderer.image(source);
    for (const [label, text] of alternatives(question)) renderer.text(`${label}) ${text}`, {size: 24, indent: 18, after: 7});
    if (includeAnswers) {
      renderer.text(`Gabarito: ${clean(question.gabarito) || "—"}`, {size: 25, bold: true, after: 10});
      if (question.comentario) renderer.text(`Comentário: ${question.comentario}`, {size: 23, after: 8});
      if (question.fundamento) renderer.text(`Fundamento: ${question.fundamento}`, {size: 23, after: 8});
      if (question.pegadinha) renderer.text(`Pegadinha: ${question.pegadinha}`, {size: 23, after: 8});
    }
    renderer.divider();
  }
  return renderer.pages;
}

const canvasJpeg = canvas => new Promise((resolve, reject) => {
  canvas.toBlob(async blob => {
    if (!blob) return reject(new Error("Falha ao rasterizar uma página do PDF."));
    resolve(new Uint8Array(await blob.arrayBuffer()));
  }, "image/jpeg", 0.93);
});

async function buildRasterPdf(canvases) {
  const images = await Promise.all(canvases.map(canvasJpeg));
  const count = images.length;
  const maxId = 2 + count * 3;
  const objects = new Map();
  const pageIds = [];
  objects.set(1, encodeAscii("<< /Type /Catalog /Pages 2 0 R >>"));
  for (let index = 0; index < count; index += 1) pageIds.push(3 + index * 3);
  objects.set(2, encodeAscii(`<< /Type /Pages /Count ${count} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`));

  for (let index = 0; index < count; index += 1) {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const content = encodeAscii("q\n595 0 0 842 0 0 cm\n/Im1 Do\nQ\n");
    objects.set(pageId, encodeAscii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    objects.set(contentId, concatBytes([
      encodeAscii(`<< /Length ${content.length} >>\nstream\n`),
      content,
      encodeAscii("endstream"),
    ]));
    objects.set(imageId, concatBytes([
      encodeAscii(`<< /Type /XObject /Subtype /Image /Width ${PAGE.width} /Height ${PAGE.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${images[index].length} >>\nstream\n`),
      images[index],
      encodeAscii("\nendstream"),
    ]));
  }

  const chunks = [encodeAscii("%PDF-1.4\n% SEDES/DF faithful raster PDF\n")];
  const offsets = new Array(maxId + 1).fill(0);
  let length = chunks[0].length;
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = length;
    const objectBytes = concatBytes([encodeAscii(`${id} 0 obj\n`), objects.get(id), encodeAscii("\nendobj\n")]);
    chunks.push(objectBytes);
    length += objectBytes.length;
  }
  const xrefOffset = length;
  const xref = [`xref\n0 ${maxId + 1}\n`, "0000000000 65535 f \n"];
  for (let id = 1; id <= maxId; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  chunks.push(encodeAscii(xref.join("")));
  return concatBytes(chunks);
}

async function downloadFaithfulPdf(includeAnswers, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Gerando PDF fiel…";
  try {
    const material = await loadMaterial();
    const pages = await renderMaterial(material, includeAnswers);
    const bytes = await buildRasterPdf(pages);
    const blob = new Blob([bytes], {type: "application/pdf"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(material.nome)}-${includeAnswers ? "comentado" : "sem-gabarito"}.pdf`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("PDF fiel baixado com Unicode e imagens renderizadas pelo navegador.", "success");
  } catch (error) {
    console.error("Falha no PDF fiel:", error);
    toast(error.message || "Não foi possível gerar o PDF fiel. Use a opção de impressão completa.", "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest?.("[data-work-pdf]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const includeAnswers = button.dataset.workPdf === "answers";
  downloadFaithfulPdf(includeAnswers, button);
}, true);

window.SEDES_PDF_FIDELITY = Object.freeze({
  renderMaterial,
  buildRasterPdf,
});
