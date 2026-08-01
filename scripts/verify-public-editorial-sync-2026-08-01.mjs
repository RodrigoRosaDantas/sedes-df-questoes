const BASE = 'https://rodrigorosadantas.github.io/sedes-df-questoes/';
const EXPECTED_COMMIT = '946a2914979a91f6d57f5044e35cdb25cf5fde7b';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function json(relative) {
  const response = await fetch(new URL(`${relative}?verify=${Date.now()}`, BASE), {cache: 'no-store'});
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  return response.json();
}

let state;
let lastError;
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    const [buildInfo, receipt, catalog] = await Promise.all([
      json('data/release/build-info.json'),
      json('data/release/editorial-sync-receipt.json'),
      json('data/release/catalogo.json'),
    ]);
    if (buildInfo.source_sha !== EXPECTED_COMMIT) {
      throw new Error(`build público ainda não corresponde ao commit ${EXPECTED_COMMIT.slice(0, 7)}.`);
    }
    if (receipt.operation_id !== 'PLATFORM-EDITORIAL-SYNC-2026-08-01'
      || receipt.updated_records !== 165
      || receipt.full_editorial !== 120
      || receipt.foundation_only !== 45
      || receipt.total_questions_preserved !== 2536) {
      throw new Error(`recibo público divergente: ${JSON.stringify(receipt)}`);
    }
    if (catalog.summary?.questoes !== 2536) {
      throw new Error(`catálogo público contém ${catalog.summary?.questoes} questões; esperado 2536.`);
    }
    state = {buildInfo, receipt, catalog};
    break;
  } catch (error) {
    lastError = error;
    if (attempt < 30) await sleep(6000);
  }
}
if (!state) throw lastError || new Error('Publicação editorial não confirmada.');

const [crefito, crfdf] = await Promise.all([
  json('data/release/materials/notion-auxiliar-administrativo-crefito-17-quadrix-2026.json'),
  json('data/release/materials/notion-assistente-i-crf-df-quadrix-2026.json'),
]);
const crefitoQuestion = (crefito.questoes || []).find(item => item.codigo === 'PROVA-QDX-CREFITO17-2026-AUXILIAR-ADMINISTRATIVO-200-001');
const crfdfQuestion = (crfdf.questoes || []).find(item => item.codigo === 'PROVA-QDX-CRFDF-2026-ASSISTENTE-I-200-074');
if (!crefitoQuestion) throw new Error('Questão CREFITO-17 001 não localizada publicamente.');
if (!crfdfQuestion) throw new Error('Questão CRF-DF 074 não localizada publicamente.');
if (!crefitoQuestion.comentario || /comentário não disponível/i.test(crefitoQuestion.comentario)) {
  throw new Error('Questão CREFITO-17 001 ainda apresenta comentário genérico ou vazio.');
}
if (!crefitoQuestion.fundamento || !crefitoQuestion.subassunto || !crefitoQuestion.pegadinha) {
  throw new Error('Questão CREFITO-17 001 não contém todos os campos editoriais saneados.');
}
if (!String(crefitoQuestion.auditoria || '').includes('saneamento editorial aplicado')) {
  throw new Error('Questão CREFITO-17 001 não contém a rastreabilidade editorial pública.');
}
if (!String(crfdfQuestion.fundamento || '').startsWith('Fundamento teórico — elaboração editorial')) {
  throw new Error('Questão CRF-DF 074 ainda não apresenta o fundamento editorial saneado.');
}
console.log('✓ Auditoria pública concluída: commit correto, recibo 165/120/45, 2.536 questões preservadas e amostras editoriais confirmadas.');
