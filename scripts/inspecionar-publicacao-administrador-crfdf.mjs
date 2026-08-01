const BASE = 'https://rodrigorosadantas.github.io/sedes-df-questoes/';
const PREFIX = 'PROVA-QDX-CRFDF-2026-ADMINISTRADOR-400-';
const clean = value => String(value ?? '').trim();
const catalogResponse = await fetch(new URL('data/release/catalogo.json', BASE), {headers: {'cache-control': 'no-cache'}});
if (!catalogResponse.ok) throw new Error(`Catálogo público: HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
console.log('PUBLIC_SUMMARY=' + JSON.stringify({release_version: catalog.release_version, summary: catalog.summary, materials: (catalog.materials || []).length}));
let exactCodes = 0;
let relatedCodes = 0;
for (const metadata of catalog.materials || []) {
  const url = new URL(String(metadata.file || '').replace(/^\.\//, ''), BASE);
  const response = await fetch(url, {headers: {'cache-control': 'no-cache'}});
  if (!response.ok) throw new Error(`${metadata.id}: HTTP ${response.status}`);
  const material = await response.json();
  const haystack = JSON.stringify({metadata, id: material.id, nome: material.nome, titulo: material.titulo, cargo: material.cargo, orgao: material.orgao});
  const codes = [];
  for (const question of material.questoes || []) {
    for (const candidate of [question.codigo, question.codigo_fonte, question.id, question.code]) {
      const code = clean(candidate);
      if (!code) continue;
      if (code.startsWith(PREFIX)) exactCodes += 1;
      if (/CRF.?DF|ADMINISTRADOR/i.test(code)) relatedCodes += 1;
      if (code.startsWith(PREFIX) || /CRF.?DF/i.test(code)) codes.push(code);
    }
  }
  if (/CRF.?DF|Administrador/i.test(haystack) || codes.length) {
    console.log('PUBLIC_RELATED_MATERIAL=' + JSON.stringify({metadata, material: {id: material.id, nome: material.nome, titulo: material.titulo, cargo: material.cargo, orgao: material.orgao, questoes: (material.questoes || []).length}, codes: [...new Set(codes)].slice(0, 150)}));
  }
}
console.log('PUBLIC_CODE_COUNTS=' + JSON.stringify({exactCodes, relatedCodes}));
