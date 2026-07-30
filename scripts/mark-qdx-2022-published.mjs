const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = "784234ae-deca-4514-b60d-19524e122a89";
const LOT = "REL-2026-07-QDX-2022-GPPGADM";
const PREFIX = "PROVA-QDX-SEEDF-2022-GPPGADM-A-";
const RELEASE = process.env.RELEASE_COMMIT || "c8acc1ca772b8d5175cdadc55f998def563833eb";
const PUBLICATION_DATE = "2026-07-30";
const API = "https://api.notion.com/v1";
const VERSION = "2026-03-11";

if (!TOKEN) throw new Error("NOTION_TOKEN não está disponível.");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rich = text => ({rich_text: [{type: "text", text: {content: text}}]});

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
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    await sleep(Math.max(Number(response.headers.get("retry-after") || 0) * 1000, 400 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 600)}`);
}

async function readAll() {
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100};
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {method: "POST", body: JSON.stringify(body)});
    rows.push(...(page.results || []));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function plain(property) {
  if (!property) return "";
  if (property.type === "title") return (property.title || []).map(item => item.plain_text || "").join("");
  if (property.type === "rich_text") return (property.rich_text || []).map(item => item.plain_text || "").join("");
  return "";
}

const all = await readAll();
const selected = all.filter(page => {
  const props = page.properties || {};
  return plain(props["Código"]).startsWith(PREFIX)
    && plain(props["Lote de publicação"]) === LOT
    && props["Liberada para exportação"]?.checkbox === true;
});

if (selected.length !== 120) throw new Error(`Fechamento recusado: esperados 120 registros, encontrados ${selected.length}.`);
const numbers = selected.map(page => Number(page.properties?.["Número original"]?.number)).sort((a, b) => a - b);
for (let number = 1; number <= 120; number += 1) if (numbers[number - 1] !== number) throw new Error(`Sequência incompleta na questão ${number}.`);

let updated = 0;
for (const page of selected) {
  await request(`/pages/${page.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Código GitHub": rich(`release-2.5:${RELEASE}`),
        "Data da publicação": {date: {start: PUBLICATION_DATE}},
        "Status editorial — registro manual anterior": {select: {name: "Publicada"}},
      },
    }),
  });
  updated += 1;
  if (updated % 20 === 0) console.log(`${updated}/120 registros atualizados.`);
}
console.log(`✓ Notion fechado: ${updated} registros marcados como publicados na release ${RELEASE}.`);
