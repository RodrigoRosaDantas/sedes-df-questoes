import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://rodrigorosadantas.github.io/sedes-df-questoes';
const expectedSha = 'a90456a0674e9eb3db90cb0b1f539c2a5838fc63';
const reportPath = path.join(root, 'artifacts', 'audit-crf-corrections-public.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const prompts = {
  37: 'Apesar da crise social, a economia venezuelana em 2024 e início de 2025 apresentou estabilidade absoluta de preços, eliminando completamente a dependência histórica do país em relação às exportações de petróleo.',
  39: 'O efeito estufa é um fenômeno natural essencial para a vida na Terra; a crise climática atual é causada pelo agravamento desse efeito devido à emissão antropogênica de gases como o CO₂ e o metano.',
  52: 'A vedação do nepotismo não exige a edição de lei formal, já que a proibição decorre dos princípios insculpidos no texto constitucional que balizam a atuação da Administração Pública.',
  57: 'A conduta do farmacêutico de furtar remédios enseja sanção por improbidade administrativa, já que atenta contra a economia popular.',
  61: 'As infrações estabelecidas na Lei de Improbidade Administrativa não estão sujeitas à prescrição.',
  64: 'O direito de recorrer de decisões administrativas é amplo, incluindo a alegação de suspeição.',
  67: 'Em relação à publicação de informações a respeito da remuneração, atende aos regulamentos de transparência ativa a publicação de apenas o vencimento, soldo ou subsídio e os proventos de aposentadoria e pensões dos respectivos servidores.',
  70: 'Considera-se dado pessoal sensível aquele que disser respeito a origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político.',
  94: 'A solicitação de verba a um ministério, o encaminhamento de processo administrativo a outro órgão e o convite formal para eventos oficiais são realizados, preferencialmente, mediante ofício.',
  101: 'Diana mostra presteza e Elton é impecável na tolerância durante o seu atendimento.',
  109: 'O respeito à diversidade e às opiniões distintas dentro da equipe de trabalho, embora não promovam ambiente de aprendizagem, permitem a aceitação de visões divergentes.',
};
const foundations = {
  71: 'Referencial teórico de Administração: a função direção conduz, orienta e coordena a execução do trabalho planejado.',
  72: 'Referencial teórico de Administração: planejamento operacional é de curto prazo e do nível operacional; médio prazo e nível intermediário correspondem ao planejamento tático.',
  73: 'Estrutura Conceitual para Relatório Financeiro (CPC 00 R2/NBC TG): passivo é obrigação presente; patrimônio líquido representa participação residual, não dívida obrigatória.',
};

async function getJson(url) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}audit=${Date.now()}`, {
    headers: {'cache-control': 'no-cache, no-store'},
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

let buildInfo = null;
for (let attempt = 1; attempt <= 60; attempt += 1) {
  buildInfo = await getJson(`${base}/data/release/build-info.json`);
  if (buildInfo.source_sha === expectedSha) break;
  if (attempt === 60) {
    throw new Error(`Site ainda serve ${buildInfo.source_sha || '(sem SHA)'}; esperado ${expectedSha}.`);
  }
  console.log(`Aguardando deploy ${expectedSha}; público atual ${buildInfo.source_sha || '(indisponível)'} (${attempt}/60).`);
  await sleep(10_000);
}

const material = await getJson(`${base}/data/release/materials/notion-assistente-i-crf-df-quadrix-2026.json`);
const questions = material.questoes || material.questions || [];
const byNumber = new Map(questions.map(question => [Number(question.numero ?? question.original_number), question]));
const verified = [];
for (const [numberText, expected] of Object.entries(prompts)) {
  const number = Number(numberText);
  const question = byNumber.get(number);
  if (!question) throw new Error(`Item ${number} ausente no material público.`);
  const actual = question.enunciado ?? question.prompt;
  if (actual !== expected) throw new Error(`Item ${number}: enunciado público divergente.`);
  verified.push({number, field: 'prompt'});
}
for (const [numberText, expected] of Object.entries(foundations)) {
  const number = Number(numberText);
  const question = byNumber.get(number);
  if (!question) throw new Error(`Item ${number} ausente no material público.`);
  const actual = question.fundamento ?? question.foundation;
  if (actual !== expected) throw new Error(`Item ${number}: fundamento público divergente.`);
  verified.push({number, field: 'foundation'});
}

const report = {
  expected_sha: expectedSha,
  public_sha: buildInfo.source_sha,
  version: buildInfo.version,
  questions_total: buildInfo.questions,
  materials_total: buildInfo.materials,
  material_questions: questions.length,
  verified_count: verified.length,
  verified,
};
await fs.mkdir(path.dirname(reportPath), {recursive: true});
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`✓ Site público no commit ${expectedSha}; ${verified.length} correções confirmadas.`);
