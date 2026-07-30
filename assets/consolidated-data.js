(() => {
  const previousFetch = window.fetch.bind(window);
  const catalogUrl = new URL("./data/catalogo.json", window.location.href).href;
  const bundleUrl = new URL("./data/materiais.bundle.b64", window.location.href).href;
  const indexUrl = new URL("./data/consolidated/index.json", window.location.href).href;
  const partialIds = new Set([
    "sim-emilia-2026-tdas-pt03",
    "sim-emilia-2026-tdas-pt05",
    "sim-emilia-2026-tdas-pt15",
  ]);

  let indexPromise = null;
  let consolidatedPromise = null;

  const loadIndex = () => indexPromise ||= previousFetch(indexUrl, {cache: "no-store"}).then(response => {
    if (!response.ok) throw new Error(`Índice consolidado: HTTP ${response.status}`);
    return response.json();
  });

  const toBytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
  const toBase64 = bytes => {
    let binary = "";
    const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) binary += String.fromCharCode(...bytes.subarray(index, index + size));
    return btoa(binary);
  };
  const gunzipJSON = async encoded => {
    if (typeof DecompressionStream === "undefined") throw new Error("Navegador sem suporte à descompactação do banco.");
    const stream = new Blob([toBytes(encoded)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  };
  const gzipJSON = async value => {
    if (typeof CompressionStream === "undefined") throw new Error("Navegador sem suporte à compactação do banco.");
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  };

  function validateMaterial(meta, material) {
    if (!material || typeof material !== "object") throw new Error(`${meta.code}: arquivo inválido.`);
    if (material.id !== `sim-emilia-2026-tdas-${meta.code.toLowerCase()}`) throw new Error(`${meta.code}: ID do material divergente.`);
    if (!Array.isArray(material.questoes) || material.questoes.length !== Number(meta.count)) {
      throw new Error(`${meta.code}: esperado ${meta.count}, encontrado ${material.questoes?.length || 0}.`);
    }
    const ids = new Set();
    const codes = new Set();
    for (const question of material.questoes) {
      if (!question.id || !question.codigo || !question.enunciado || !question.comentario) throw new Error(`${meta.code}: questão incompleta.`);
      if (ids.has(question.id) || codes.has(question.codigo)) throw new Error(`${meta.code}: questão duplicada.`);
      ids.add(question.id); codes.add(question.codigo);
      for (const letter of ["A", "B", "C", "D", "E"]) if (!question.alternativas?.[letter]) throw new Error(`${question.codigo}: alternativa ${letter} ausente.`);
      if (!["A", "B", "C", "D", "E", "Certo", "Errado", "Anulada"].includes(question.gabarito)) throw new Error(`${question.codigo}: gabarito inválido.`);
    }
    return material;
  }

  const loadConsolidated = () => consolidatedPromise ||= loadIndex().then(async index => {
    const responses = await Promise.all(index.materials.map(meta => previousFetch(new URL(meta.file, window.location.href), {cache: "no-store"})));
    for (const response of responses) if (!response.ok) throw new Error(`Arquivo consolidado: HTTP ${response.status}`);
    const files = await Promise.all(responses.map(response => response.json()));
    const materials = files.map((material, position) => validateMaterial(index.materials[position], material));
    const total = materials.reduce((sum, material) => sum + material.questoes.length, 0);
    if (total !== Number(index.expected_questions)) throw new Error(`Lote consolidado: esperado ${index.expected_questions}, encontrado ${total}.`);
    return {index, materials};
  });

  function materialMetadata(material) {
    const {questoes, ...metadata} = material;
    return metadata;
  }

  window.fetch = async (input, init = {}) => {
    const requestedUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url, window.location.href).href;

    if (requestedUrl === catalogUrl) {
      const response = await previousFetch(input, {...init, cache: "no-store"});
      if (!response.ok) return response;
      try {
        const [catalog, consolidated] = await Promise.all([response.json(), loadConsolidated()]);
        const retained = (catalog.materials || []).filter(material => !partialIds.has(material.id));
        const materials = [...retained, ...consolidated.materials.map(materialMetadata)];
        const questoes = materials.reduce((sum, material) => sum + Number(material.quantidade_questoes || 0), 0);
        const result = {
          ...catalog,
          schema_version: "4.0",
          exported_at: "2026-07-29T22:20:00-03:00",
          source: {
            ...catalog.source,
            criteria: "570 questões consolidadas no CONSOL01; 300 inserções recentes permanecem fora do site até revisão estrutural e editorial."
          },
          summary: {
            banco_mestre: 870,
            materiais: materials.length,
            questoes,
            aguardando_exportacao: 300,
            provas: materials.filter(material => String(material.tipo_material).toLowerCase() === "prova").length,
            simulados: materials.filter(material => String(material.tipo_material).toLowerCase() === "simulado").length,
          },
          materials,
          consolidated_source: consolidated.index.source_url,
        };
        if (result.summary.questoes !== 570 || result.summary.materiais !== 35) throw new Error(`Catálogo final inválido: ${result.summary.questoes} questões em ${result.summary.materiais} materiais.`);
        return new Response(JSON.stringify(result), {status: 200, headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}});
      } catch (error) {
        console.error("Falha ao montar catálogo consolidado:", error);
        return new Response("", {status: 500, statusText: "Falha no catálogo consolidado"});
      }
    }

    if (requestedUrl === bundleUrl) {
      const response = await previousFetch(input, {...init, cache: "no-store"});
      if (!response.ok) return response;
      try {
        const [bundle, consolidated] = await Promise.all([gunzipJSON((await response.text()).trim()), loadConsolidated()]);
        bundle.materials = (bundle.materials || []).filter(material => !partialIds.has(material.id));
        for (const material of consolidated.materials) {
          const index = bundle.materials.findIndex(item => item.id === material.id);
          if (index >= 0) bundle.materials[index] = material;
          else bundle.materials.push(material);
        }
        const total = bundle.materials.reduce((sum, material) => sum + (material.questoes || []).length, 0);
        if (total !== 570 || bundle.materials.length !== 35) throw new Error(`Banco final inválido: ${total} questões em ${bundle.materials.length} materiais.`);
        bundle.exported_at = "2026-07-29T22:20:00-03:00";
        bundle.consolidated_release = {source: consolidated.index.source, questions: 570, materials: 35};
        return new Response(await gzipJSON(bundle), {status: 200, headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"}});
      } catch (error) {
        console.error("Falha ao montar banco consolidado:", error);
        return new Response("", {status: 500, statusText: "Falha no banco consolidado"});
      }
    }

    return previousFetch(input, init);
  };
})();
