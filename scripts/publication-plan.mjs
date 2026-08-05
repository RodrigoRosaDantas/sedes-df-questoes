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

function explicitScope(snapshot) {
  const raw = snapshot.publication_scope?.codes;
  if (raw == null) return null;
  if (!Array.isArray(raw) || !raw.length) throw new Error('Escopo explícito de publicação está vazio ou inválido.');
  const codes = raw.map(clean);
  if (codes.some(code => !code)) throw new Error('Escopo explícito contém código vazio.');
  if (new Set(codes).size !== codes.length) throw new Error('Escopo explícito contém código repetido.');
  return {
    operation: clean(snapshot.publication_scope?.operation) || null,
    codes: new Set(codes),
    sortedCodes: [...codes].sort((left, right) => left.localeCompare(right, 'pt-BR')),
  };
}

export function buildPublicationPlan(snapshotContent) {
  const {buffer, snapshot} = normalizedSnapshot(snapshotContent);
  const scope = explicitScope(snapshot);
  const candidates = snapshot.records.filter(record => {
    const code = clean(record.code);
    if (clean(record.github_id)) return false;
    return scope ? scope.codes.has(code) : true;
  });
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

  if (scope) {
    const missing = scope.sortedCodes.filter(code => !seenCodes.has(code));
    if (missing.length) throw new Error(`Escopo explícito não foi resolvido integralmente: ${missing.slice(0, 5).join(', ')}.`);
    if (seenCodes.size !== scope.codes.size) {
      throw new Error(`Escopo explícito esperava ${scope.codes.size} registros, mas resolveu ${seenCodes.size}.`);
    }
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
    ...(scope ? {
      scope: {
        operation: scope.operation,
        expected_count: scope.sortedCodes.length,
        codes_sha256: sha256(scope.sortedCodes.join('\n')),
      },
    } : {}),
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
      + `${expected.total_records} registro(s) do escopo eram esperados.`,
    );
  }
  return expected;
}
