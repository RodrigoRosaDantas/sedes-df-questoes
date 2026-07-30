import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = "784234ae-deca-4514-b60d-19524e122a89";
const LOT = "REL-2026-07-QDX-2022-GPPGADM";
const PREFIX = "PROVA-QDX-SEEDF-2022-GPPGADM-A-";
const OUTPUT = path.join(root, "data/true-false/qdx-seedf-2022-gppgadm-a.json");
const INDEX = path.join(root, "data/true-false/index.json");
const IMAGE = path.join(root, "assets/images/excel-analise-rapida-q23.svg");
const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";

if (!TOKEN) throw new Error("NOTION_TOKEN não está disponível.");
const clean = value => String(value ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
const rich = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? "").join("").trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 7) {
    await sleep(Math.max(Number(response.headers.get("retry-after") || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

function value(property) {
  if (!property) return null;
  if (property.type === "title") return rich(property.title);
  if (property.type === "rich_text") return rich(property.rich_text);
  if (property.type === "select") return property.select?.name ?? null;
  if (property.type === "status") return property.status?.name ?? null;
  if (property.type === "checkbox") return Boolean(property.checkbox);
  if (property.type === "number") return property.number;
  if (property.type === "url") return property.url;
  if (property.type === "date") return property.date?.start ?? null;
  if (property.type === "formula") {
    const formula = property.formula;
    if (!formula) return null;
    return formula[formula.type] ?? null;
  }
  return null;
}

async function readAll() {
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100};
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {method: "POST", body: JSON.stringify(body)});
    for (const item of page.results || []) {
      const properties = Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)]));
      rows.push({notion_id: item.id, notion_url: item.url, ...properties});
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function question(row) {
  const number = Number(row["Número original"]);
  return {
    id: `qdx-seedf-2022-gppgadm-a-${String(number).padStart(3, "0")}`,
    codigo: clean(row["Código"]),
    numero: number,
    bloco: clean(row["Bloco"]),
    disciplina: clean(row["Disciplina"]),
    assunto: clean(row["Assunto"]),
    subassunto: clean(row["Subassunto"]),
    texto_base: clean(row["Texto-base"]),
    enunciado: clean(row["Enunciado"]),
    alternativas: {Certo: "Certo", Errado: "Errado"},
    gabarito: clean(row["Gabarito"]),
    comentario: clean(row["Comentário geral"]),
    fundamento: clean(row["Fundamento legal"]),
    pegadinha: clean(row["Pegadinha"]),
    observacoes: clean(row["Observações"]),
    formato_questao: "Certo / Errado",
    numero_original: number,
    pagina_pdf: clean(row["Página do PDF"]),
    fonte_oficial: clean(row["URL da fonte"]),
    notion_url: row.notion_url,
    anulada: Boolean(row["Anulada"]),
    possui_imagem: Boolean(row["Possui imagem"]),
    imagem: number === 23 ? "./assets/images/excel-analise-rapida-q23.svg" : "",
    descricao_imagem: clean(row["Descrição da imagem"]),
  };
}

function validate(rows, questions) {
  if (rows.length !== 120) throw new Error(`O lote deve conter 120 registros; foram encontrados ${rows.length}.`);
  const expected = Array.from({length: 120}, (_, index) => index + 1);
  const numbers = questions.map(item => item.numero).sort((a, b) => a - b);
  const missing = expected.filter(number => !numbers.includes(number));
  const repeated = numbers.filter((number, index) => numbers.indexOf(number) !== index);
  if (missing.length || repeated.length) throw new Error(`Sequência inválida. Ausentes: ${missing.join(", ") || "nenhum"}; repetidos: ${[...new Set(repeated)].join(", ") || "nenhum"}.`);
  const codes = new Set();
  for (const item of questions) {
    for (const [field, label] of [[item.codigo, "código"], [item.enunciado, "enunciado"], [item.gabarito, "gabarito"], [item.comentario, "comentário"], [item.disciplina, "disciplina"]]) {
      if (!field) throw new Error(`${item.codigo || item.numero}: ${label} ausente.`);
    }
    if (!["Certo", "Errado", "Anulada"].includes(item.gabarito)) throw new Error(`${item.codigo}: gabarito inválido.`);
    if (codes.has(item.codigo)) throw new Error(`Código duplicado: ${item.codigo}`);
    codes.add(item.codigo);
    if (item.possui_imagem && (!item.imagem || !item.descricao_imagem)) throw new Error(`${item.codigo}: recurso visual incompleto.`);
  }
  const imageQuestions = questions.filter(item => item.possui_imagem);
  if (imageQuestions.length !== 1 || imageQuestions[0].numero !== 23) throw new Error("A validação visual esperava somente a questão 23.");
}

const all = await readAll();
const selected = all.filter(row => clean(row["Lote de publicação"]) === LOT && row["Liberada para exportação"] === true && clean(row["Código"]).startsWith(PREFIX));
const questions = selected.map(question).sort((a, b) => a.numero - b.numero);
validate(selected, questions);

const material = {
  id: "prova-qdx-seedf-2022-gppgadm-a",
  tipo_material: "prova",
  fonte: "Instituto Quadrix",
  nome: "Gestor em Políticas Públicas e Gestão Governamental — Administração — SEEDF/DF — Quadrix 2022 — Tipo A",
  ano: 2022,
  orgao: "Secretaria de Estado de Educação do Distrito Federal — SEEDF/DF",
  cargo: "EDAS — Administração (prova correlata)",
  codigo_cargo: "400",
  cargo_origem: "Gestor PPGE — Administração",
  codigo_cargo_origem: "467",
  disciplina: "Múltiplas matérias",
  bloco: "Prova completa",
  status: "publicado",
  source_url: "https://quadrix.org.br/informacoes/1180/",
  formato_questao: "Certo / Errado",
  quantidade_questoes: 120,
  tempo_sugerido_minutos: 120,
  lote_publicacao: LOT,
  comentarios_status: "concluido",
  questoes: questions,
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-labelledby="title desc"><title id="title">Ferramenta Análise Rápida do Excel 2016</title><desc id="desc">Botão quadrado com pequena grade e raio laranja.</desc><rect x="8" y="8" width="80" height="80" rx="12" fill="#fff" stroke="#6b7280" stroke-width="4"/><g fill="#4b5563"><rect x="22" y="22" width="14" height="14" rx="2"/><rect x="40" y="22" width="14" height="14" rx="2"/><rect x="22" y="40" width="14" height="14" rx="2"/><rect x="40" y="40" width="14" height="14" rx="2"/></g><path d="M63 31 49 56h12l-7 21 23-31H65l8-15Z" fill="#f97316" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/></svg>\n`;

const index = JSON.parse(await fs.readFile(INDEX, "utf8"));
index.status = "publicacao_parcial_concluida";
index.materials = [{file: "./data/true-false/qdx-seedf-2022-gppgadm-a.json", expected_questions: 120, lote_publicacao: LOT}];
index.planned = (index.planned || []).map(item => item.prefix === PREFIX ? {...item, publication_status: "publicado", questions: 120} : item);

await fs.mkdir(path.dirname(OUTPUT), {recursive: true});
await fs.mkdir(path.dirname(IMAGE), {recursive: true});
await fs.writeFile(OUTPUT, `${JSON.stringify(material, null, 2)}\n`);
await fs.writeFile(INDEX, `${JSON.stringify(index, null, 2)}\n`);
await fs.writeFile(IMAGE, svg);
console.log(`✓ Lote ${LOT} exportado: 120/120 itens, sequência íntegra e questão visual 23 preservada.`);
