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
  let parsedMaterialsPromise = null;

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

  const clean = value => String(value || "")
    .replace(/\r/g, "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n{3,}/g, "\n\n");

  function extractTextBase(markdown) {
    const match = markdown.match(/##\s+Texto(?: de apoio|-base)[^\n]*\n([\s\S]*?)(?=\n##\s+Questões|\n###\s+[A-Z0-9-]+|$)/i);
    return match ? clean(match[1].replace(/^>\s?/gm, "")) : "";
  }

  function parseQuestionBlock(code, block, meta, textBase) {
    const lines = clean(block).split("\n");
    const altPattern = /^([A-E])\)\s*(.*)$/;
    const answerPattern = /^\*\*Gabarito:\*\*\s*(A|B|C|D|E|Certo|Errado|Anulada)\.?\s*$/i;
    const commentPattern = /^\*\*Comentário:\*\*\s*(.*)$/i;
    const foundationPattern = /^\*\*Fundamento(?: legal)?:\*\*\s*(.*)$/i;
    const originPattern = /^\*\*(?:Origem final|Origem|Observação):\*\*\s*(.*)$/i;

    const alternatives = {};
    const prompt = [];
    const comment = [];
    const foundation = [];
    const notes = [];
    let currentAlternative = null;
    let mode = "prompt";
    let answer = "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (mode === "prompt" && prompt.length) prompt.push("");
        continue;
      }
      const alt = line.match(altPattern);
      if (alt) {
        currentAlternative = alt[1];
        alternatives[currentAlternative] = alt[2].trim();
        mode = "alternative";
        continue;
      }
      const answerMatch = line.match(answerPattern);
      if (answerMatch) {
        answer = answerMatch[1];
        mode = "after-answer";
        currentAlternative = null;
        continue;
      }
      const commentMatch = line.match(commentPattern);
      if (commentMatch) {
        comment.push(commentMatch[1]);
        mode = "comment";
        currentAlternative = null;
        continue;
      }
      const foundationMatch = line.match(foundationPattern);
      if (foundationMatch) {
        foundation.push(foundationMatch[1]);
        mode = "foundation";
        currentAlternative = null;
        continue;
      }
      const originMatch = line.match(originPattern);
      if (originMatch) {
        notes.push(originMatch[1]);
        mode = "notes";
        currentAlternative = null;
        continue;
      }
      if (/^\*\*[^*]+:\*\*/.test(line)) {
        notes.push(line.replace(/\*\*/g, ""));
        mode = "notes";
        currentAlternative = null;
        continue;
      }
      if (mode === "alternative" && currentAlternative) alternatives[currentAlternative] += ` ${line}`;
      else if (mode === "comment") comment.push(line);
      else if (mode === "foundation") foundation.push(line);
      else if (mode === "notes" || mode === "after-answer") notes.push(line);
      else prompt.push(line);
    }

    const expectedLetters = ["A", "B", "C", "D", "E"];
    if (!prompt.join(" ").trim()) throw new Error(`${meta.code}/${code}: enunciado ausente.`);
    for (const letter of expectedLetters) if (!alternatives[letter]?.trim()) throw new Error(`${meta.code}/${code}: alternativa ${letter} ausente.`);
    if (!expectedLetters.includes(answer) && !["Certo", "Errado", "Anulada"].includes(answer)) throw new Error(`${meta.code}/${code}: gabarito inválido.`);
    if (!comment.join(" ").trim()) throw new Error(`${meta.code}/${code}: comentário ausente.`);

    return {
      id: `consol-${meta.code.toLowerCase()}-${code.toLowerCase()}`,
      codigo: `CONSOL-${meta.code}-${code}`,
      numero: Number(code.match(/(\d+)$/)?.[1] || 0),
      assunto: meta.name.replace(/^Simulado\s+[A-Z0-9]+\s+—\s+/, ""),
      subassunto: "",
      texto_base: textBase,
      enunciado: clean(prompt.join("\n")),
      alternativas: Object.fromEntries(expectedLetters.map(letter => [letter, clean(alternatives[letter])])),
      gabarito: answer,
      comentario: clean(comment.join(" ")),
      fundamento: clean(foundation.join(" ")),
      pegadinha: "",
      observacoes: clean(notes.join(" ")),
      fonte_consolidada: meta.source_url,
      auditoria: "CONSOL01 — versão final saneada",
    };
  }

  function parseMaterial(meta, markdown) {
    const textBase = extractTextBase(markdown);
    const matcher = /^###\s+([A-Z0-9]+-\d+)\s*\n([\s\S]*?)(?=^###\s+[A-Z0-9]+-\d+\s*$|\Z)/gm;
    const questions = [];
    let match;
    while ((match = matcher.exec(`${markdown}\n`))) questions.push(parseQuestionBlock(match[1], match[2], meta, textBase));
    if (questions.length !== Number(meta.count)) throw new Error(`${meta.code}: esperado ${meta.count}, encontrado ${questions.length}.`);
    const ids = new Set(questions.map(question => question.id));
    if (ids.size !== questions.length) throw new Error(`${meta.code}: IDs duplicados.`);
    return {
      id: `sim-emilia-2026-tdas-${meta.code.toLowerCase()}`,
      tipo_material: "simulado",
      fonte: "Emília Adelino — CONSOL01",
      nome: meta.name,
      ano: 2026,
      orgao: "SEDES/DF",
      cargo: "TDAS — Técnico Administrativo",
      codigo_cargo: "202",
      disciplina: meta.discipline,
      bloco: meta.block,
      quantidade_questoes: questions.length,
      tempo_sugerido_minutos: questions.length * 2,
      status: "publicado",
      source_url: meta.source_url,
      questoes: questions,
    };
  }

  const loadParsedMaterials = () => parsedMaterialsPromise ||= loadIndex().then(async index => {
    const responses = await Promise.all(index.materials.map(meta => previousFetch(new URL(meta.file, window.location.href), {cache: "no-store"})));
    for (const response of responses) if (!response.ok) throw new Error(`Arquivo consolidado: HTTP ${response.status}`);
    const markdowns = await Promise.all(responses.map(response => response.text()));
    const materials = index.materials.map((meta, position) => parseMaterial(meta, markdowns[position]));
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
        const [catalog, consolidated] = await Promise.all([response.json(), loadParsedMaterials()]);
        const retained = (catalog.materials || []).filter(material => !partialIds.has(material.id));
        const materials = [...retained, ...consolidated.materials.map(materialMetadata)];
        const questoes = materials.reduce((sum, material) => sum + Number(material.quantidade_questoes || 0), 0);
        const result = {
          ...catalog,
          schema_version: "4.0",
          exported_at: "2026-07-29T21:55:00-03:00",
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
        const [bundle, consolidated] = await Promise.all([gunzipJSON((await response.text()).trim()), loadParsedMaterials()]);
        bundle.materials = (bundle.materials || []).filter(material => !partialIds.has(material.id));
        for (const material of consolidated.materials) {
          const index = bundle.materials.findIndex(item => item.id === material.id);
          if (index >= 0) bundle.materials[index] = material;
          else bundle.materials.push(material);
        }
        const total = bundle.materials.reduce((sum, material) => sum + (material.questoes || []).length, 0);
        if (total !== 570 || bundle.materials.length !== 35) throw new Error(`Banco final inválido: ${total} questões em ${bundle.materials.length} materiais.`);
        bundle.exported_at = "2026-07-29T21:55:00-03:00";
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
