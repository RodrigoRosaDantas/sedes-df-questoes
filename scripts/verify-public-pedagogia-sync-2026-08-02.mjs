const BASE = 'https://rodrigorosadantas.github.io/sedes-df-questoes/';
const EXPECTED_COMMIT = '323fb5c39b9126a0f8559869a445edbec020add0';
const MATERIAL = 'data/release/materials/notion-professor-de-educacao-basica-pedagogia-seedf-df-quadrix-2025-tipo-a.json';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function json(relative) {
  const url = new URL(relative, BASE);
  url.searchParams.set('verify', `${Date.now()}-${Math.random()}`);
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  return response.json();
}

function assertQuestion(question, code) {
  if (!question) throw new Error(`${code}: questão não localizada publicamente.`);
  if (!question.comentario || /comentário não disponível/i.test(question.comentario)) {
    throw new Error(`${code}: comentário ainda genérico ou vazio.`);
  }
  if (!question.fundamento || !question.subassunto || !question.pegadinha) {
    throw new Error(`${code}: campos editoriais incompletos.`);
  }
  if (question.fonte_oficial !== 'https://www.quadrix.org.br/informacoes/2/') {
    throw new Error(`${code}: fonte oficial divergente.`);
  }
  if (!String(question.auditoria || '').includes('saneamento editorial aplicado em 02/08/2026')) {
    throw new Error(`${code}: rastreabilidade editorial pública ausente.`);
  }
}

let lastError;
for (let attempt = 1; attempt <= 35; attempt += 1) {
  try {
    const [buildInfo, receipt, previousReceipt, catalog, material] = await Promise.all([
      json('data/release/build-info.json'),
      json('data/release/pedagogia-editorial-sync-receipt.json'),
      json('data/release/editorial-sync-receipt.json'),
      json('data/release/catalogo.json'),
      json(MATERIAL),
    ]);

    if (buildInfo.source_sha !== EXPECTED_COMMIT) {
      throw new Error(`commit público ${buildInfo.source_sha || 'ausente'}; esperado ${EXPECTED_COMMIT}.`);
    }
    if (receipt.operation_id !== 'PLATFORM-EDITORIAL-SYNC-PEDAGOGIA-2026-08-02'
      || receipt.updated_records !== 72
      || receipt.full_editorial !== 72
      || receipt.total_questions_preserved !== 2536
      || receipt.changed_materials !== 1) {
      throw new Error(`recibo de Pedagogia divergente: ${JSON.stringify(receipt)}`);
    }
    if (previousReceipt.updated_records !== 165 || previousReceipt.total_questions_preserved !== 2536) {
      throw new Error('saneamento editorial anterior deixou de estar preservado.');
    }
    if (catalog.summary?.questoes !== 2536 || catalog.summary?.materiais !== 63) {
      throw new Error(`catálogo público divergente: ${JSON.stringify(catalog.summary)}`);
    }
    if ((material.questoes || []).length !== 72) {
      throw new Error(`material público contém ${(material.questoes || []).length} questões; esperado 72.`);
    }

    for (const number of [47, 81, 120]) {
      const code = `PROVA-QDX-SEEDF-2025-PED-A-${String(number).padStart(3, '0')}`;
      assertQuestion((material.questoes || []).find(item => item.codigo === code), code);
    }

    console.log('✓ Auditoria pública de Pedagogia concluída: commit correto, recibo 72/72, 2.536 questões preservadas e amostras 47/81/120 confirmadas.');
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log(`Tentativa ${attempt}/35: publicação ainda não confirmada — ${error.message}`);
    if (attempt < 35) await sleep(6000);
  }
}
throw lastError || new Error('Publicação de Pedagogia não confirmada.');
