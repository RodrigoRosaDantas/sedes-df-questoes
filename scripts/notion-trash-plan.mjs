import {
  EXPECTED, alternativesOf, clean, composite, fingerprint, key, legacyPublicId,
} from './notion-trash-common.mjs';

function add(map, name, value) {
  if (!name) return;
  if (!map.has(name)) map.set(name, []);
  map.get(name).push(value);
}
const unique = map => new Map([...map].filter(([, values]) => values.length === 1).map(([name, values]) => [name, values[0]]));

function indexes(questions) {
  const byCode = new Map();
  const byId = new Map();
  const byFingerprint = new Map();
  const byComposite = new Map();
  const byNotionUrl = new Map();
  for (const question of questions) {
    add(byCode, key(question.code), question);
    add(byCode, key(question.source_code), question);
    add(byId, key(question.public_id), question);
    add(byFingerprint, fingerprint(question.prompt, question.alternatives, question.answer), question);
    add(byComposite, composite(question.material_name, question.original_number), question);
    add(byNotionUrl, key(question.notion_url), question);
  }
  return {byCode, byId, byFingerprint: unique(byFingerprint), byComposite: unique(byComposite), byNotionUrl: unique(byNotionUrl)};
}

function candidateQuestions(entity, index) {
  const found = new Map();
  const include = question => question && found.set(question.public_id, question);
  for (const question of index.byCode.get(key(entity.code ?? entity['Código'])) || []) include(question);
  const github = legacyPublicId(entity.github_id ?? entity['Código GitHub']);
  for (const question of index.byId.get(key(github)) || []) include(question);
  for (const question of index.byCode.get(key(github)) || []) include(question);
  include(index.byFingerprint.get(fingerprint(
    entity.prompt ?? entity['Enunciado'],
    entity.alternatives ?? alternativesOf(entity),
    entity.answer ?? entity['Gabarito'],
  )));
  include(index.byComposite.get(composite(
    entity.material_name ?? entity['Nome do material'],
    entity.original_number ?? entity['Número original'],
  )));
  include(index.byNotionUrl.get(key(entity.notion_url)));
  return [...found.values()];
}

function relationScore(entity, question) {
  let score = 0;
  const code = key(entity.code ?? entity['Código']);
  const github = key(legacyPublicId(entity.github_id ?? entity['Código GitHub']));
  if (question.source_code && code === key(question.source_code)) score += 20000;
  if (code === key(question.code)) score += 18000;
  if (github && github === key(question.public_id)) score += 16000;
  if (github && (github === key(question.code) || github === key(question.source_code))) score += 14000;
  if (key(entity.notion_url) && key(entity.notion_url) === key(question.notion_url)) score += 12000;
  if (fingerprint(entity.prompt ?? entity['Enunciado'], entity.alternatives ?? alternativesOf(entity), entity.answer ?? entity['Gabarito'])
      === fingerprint(question.prompt, question.alternatives, question.answer)) score += 10000;
  if (composite(entity.material_name ?? entity['Nome do material'], entity.original_number ?? entity['Número original'])
      === composite(question.material_name, question.original_number)) score += 6000;
  return score;
}

function rowScore(row, question, snapshotIds) {
  let score = relationScore(row, question);
  if (snapshotIds.has(row.notion_id)) score += 100000;
  if (row['Duplicada'] !== true) score += 1000;
  if (row['Anulada'] !== true) score += 500;
  if (clean(row['Código GitHub'])) score += 200;
  if (clean(row['Data da publicação'])) score += 100;
  score += Math.min([
    row['Questão'], row['Código'], row['Nome do material'], row['Enunciado'], row['Gabarito'],
    ...['A', 'B', 'C', 'D', 'E'].map(letter => row[`Alternativa ${letter}`]),
  ].reduce((sum, value) => sum + Math.min(clean(value).length, 300), 0), 999);
  return score;
}

function chooseEntityQuestion(entity, candidates) {
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => relationScore(entity, right) - relationScore(entity, left)
    || left.public_id.localeCompare(right.public_id))[0];
}

export function buildProtectionPlan(activeRows, questions, snapshotRecords, snapshotIds) {
  const index = indexes(questions);
  const siteById = new Map(questions.map(question => [question.public_id, question]));
  const activeById = new Map(activeRows.map(row => [row.notion_id, row]));
  const protectedIds = new Set(snapshotIds);
  const coveredSiteIds = new Set();
  const snapshotFailures = [];

  for (const record of snapshotRecords) {
    if (!activeById.has(record.notion_id)) snapshotFailures.push({code: record.code, reason: 'notion_id não está ativo'});
    const selected = chooseEntityQuestion(record, candidateQuestions(record, index));
    if (!selected) snapshotFailures.push({code: record.code, reason: 'sem correspondência no catálogo'});
    else coveredSiteIds.add(selected.public_id);
  }
  if (snapshotFailures.length) {
    throw new Error(`Falha ao proteger snapshot: ${snapshotFailures.length} registro(s). Amostra: ${JSON.stringify(snapshotFailures.slice(0, 5))}`);
  }
  if (coveredSiteIds.size !== EXPECTED.snapshot) {
    throw new Error(`Snapshot cobre ${coveredSiteIds.size} questões públicas; esperado ${EXPECTED.snapshot}.`);
  }

  const rowsByQuestion = new Map();
  for (const row of activeRows) {
    for (const question of candidateQuestions(row, index)) {
      if (!rowsByQuestion.has(question.public_id)) rowsByQuestion.set(question.public_id, []);
      rowsByQuestion.get(question.public_id).push(row);
    }
  }

  const legacyQuestions = questions.filter(question => !coveredSiteIds.has(question.public_id));
  const unresolved = [];
  const assignments = [];
  for (const question of legacyQuestions) {
    const candidates = (rowsByQuestion.get(question.public_id) || [])
      .filter(row => !protectedIds.has(row.notion_id))
      .sort((left, right) => rowScore(right, question, snapshotIds) - rowScore(left, question, snapshotIds)
        || clean(right.notion_last_edited_time).localeCompare(clean(left.notion_last_edited_time))
        || left.notion_id.localeCompare(right.notion_id));
    assignments.push({question, candidates});
  }
  assignments.sort((left, right) => left.candidates.length - right.candidates.length
    || left.question.public_id.localeCompare(right.question.public_id));

  for (const assignment of assignments) {
    const selected = assignment.candidates.find(row => !protectedIds.has(row.notion_id));
    if (!selected) {
      unresolved.push({
        public_id: assignment.question.public_id,
        code: assignment.question.code,
        material: assignment.question.material_name,
        number: assignment.question.original_number,
        candidates: assignment.candidates.length,
      });
      continue;
    }
    protectedIds.add(selected.notion_id);
    coveredSiteIds.add(assignment.question.public_id);
  }

  if (unresolved.length) {
    throw new Error(`Não foi possível localizar ${unresolved.length} questão(ões) públicas no Notion. Amostra: ${JSON.stringify(unresolved.slice(0, 10))}`);
  }
  if (coveredSiteIds.size !== EXPECTED.published || protectedIds.size !== EXPECTED.published) {
    throw new Error(`Proteção divergente: catálogo=${coveredSiteIds.size}, notion_ids=${protectedIds.size}, esperado=${EXPECTED.published}.`);
  }

  const targets = activeRows.filter(row => !protectedIds.has(row.notion_id));
  if (activeRows.length === EXPECTED.all && targets.length !== EXPECTED.target) {
    throw new Error(`Alvos divergentes: ${targets.length}; esperado ${EXPECTED.target}.`);
  }
  if (activeRows.length === EXPECTED.published && targets.length !== 0) {
    throw new Error(`Após conclusão ainda existem ${targets.length} registros não publicados ativos.`);
  }

  return {
    protectedIds,
    targets,
    counts: {
      active: activeRows.length,
      published: protectedIds.size,
      snapshot: snapshotIds.size,
      legacy: protectedIds.size - snapshotIds.size,
      targets: targets.length,
    },
    siteById,
  };
}
