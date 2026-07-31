import crypto from 'node:crypto';

const clean = value => String(value ?? '').trim();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function normalizedSnapshot(snapshotContent) {
  const buffer = Buffer.isBuffer(snapshotContent)
    ? snapshotContent
    : Buffer.from(String(snapshotContent), 'utf8');
  const snapshot = JSON.parse(buffer.toString('utf8'));
  if (!Array.isArray(snapshot.records)) {
    throw new Error('Snapshot do Notion sem a lista records.');
  }
  return {buffer, snapshot};
}

export function buildPublicationPlan(snapshotContent) {
  const {buffer, snapshot} = normalizedSnapshot(snapshotContent);
  const candidates = snapshot.records.filter(record => !clean(record.github_id));
  const seenCodes = new Set();
  const grouped = new Map();

  for (const record of candidates) {
    const code = clean(record.code);
    const lot = clean(record.publication_lot);
    if (!code) throw new Error('Registro publicável sem código editorial.');
    if (!lot) throw new Error(`${code}: registro sem rastreabilidade não possui lote de publicação.`);
    if (record.released_for_export !== true) {
      throw new Error(`${code}: registro sem rastreabilidade não está explicitamente liberado para exportação.`);
    }
    if (seenCodes.has(code)) throw new Error(`Código repetido no plano de publicação: ${code}.`);
    seenCodes.add(code);
    if (!grouped.has(lot)) grouped.set(lot, []);
    grouped.get(lot).push(code);
  }

  const lots = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
    .map(([lot, codes]) => {
      const sortedCodes = [...codes].sort((left, right) => left.localeCompare(right, 'pt-BR'));
      return {
        lot,
        expected_count: sortedCodes.length,
        codes_sha256: sha256(sortedCodes.join('\n')),
        codes: sortedCodes,
      };
    });

  return {
    schema_version: '1.0',
    snapshot_sha256: sha256(buffer),
    snapshot_generated_at: snapshot.generated_at || null,
    total_records: candidates.length,
    lots,
  };
}

export function validatePublicationPlan(plan, snapshotContent) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Plano de publicação ausente ou inválido.');
  }
  const expected = buildPublicationPlan(snapshotContent);
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    throw new Error(
      `Plano de publicação não corresponde exatamente ao snapshot: `
      + `${expected.total_records} registro(s) sem rastreabilidade eram esperados.`,
    );
  }
  return expected;
}
