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

  let indexPromise;
  let consolidatedPromise;

  const clean = value => String(value || "")
    .replace(/\r/g, "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\n{3,}/g, "\n\n");

  const loadIndex = () => indexPromise ||= previousFetch(indexUrl, {cache: "no-store"}).then(response => {
    if (!response.ok) throw new Error(`Índice consolidado: HTTP ${response.status}`);
    return response.json();
  });

  const toBytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
  const toBase64 = bytes => {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  };
  const gunzipJSON = async encoded => {
    if (typeof DecompressionStream === "undefined") throw new Error("Navegador sem suporte à descompactação do banco.");
    const stream = new Blob([toBytes(encoded)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  };
  const gzipJSON = async value => {
    if (typeof CompressionStream === "undefined") throw new Error("Navegador sem suporte à compactação do banco.");
    const stream = new Blob([new TextEncoder().encode(JSON.stringify(value))]).stream().pipeThrough(new CompressionStream("gzip"));
    return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  };

  function materialShell(meta, questions) {
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

  function extractTextBase(markdown) {
    const match = markdown.match(/##\s+Texto(?: de apoio|-base)[^\n]*\n([\s\S]*?)(?=\n##\s+Questões|\n###\s+[A-Z0-9]+-\d+|$)/i);
    return match ? clean(match[1].replace(/^>\s?/gm, "")) : "";
  }

  function parseMarkdownQuestion(code, block, meta, textBase) {
    const alternatives = {};
    const prompt = [];
    const comments = [];
    const foundations = [];
    const notes = [];
    let mode = "prompt";
    let currentAlternative = "";
    let answer = "";

    for (const raw of clean(block).split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const alternative = line.match(/^([A-E])\)\s*(.*)$/);
      if (alternative) {
        currentAlternative = alternative[1];
        alternatives[currentAlternative] = alternative[2].trim();
        mode = "alternative";
        continue;
      }
      const answerMatch = line.match(/^\*\*Gabarito:\*\*\s*(A|B|C|D|E|Certo|Errado|Anulada)\.?\s*$/i);
      if (answerMatch) {
        answer = answerMatch[1][0].toUpperCase() + answerMatch[1].slice(1).toLowerCase();
        mode = "answer";
        currentAlternative = "";
        continue;
      }
      const commentMatch = line.match(/^\*\*Comentário:\*\*\s*(.*)$/i);
      if (commentMatch) {
        comments.push(commentMatch[1]);
        mode = "comment";
        currentAlternative = "";
        continue;
      }
      const foundationMatch = line.match(/^\*\*Fundamento(?: legal)?:\*\*\s*(.*)$/i);
      if (foundationMatch) {
        foundations.push(foundationMatch[1]);
        mode = "foundation";
        currentAlternative = "";
        continue;
      }
      const noteMatch = line.match(/^\*\*(?:Origem final|Origem|Observação|Observações):\*\*\s*(.*)$/i);
      if (noteMatch) {
        notes.push(noteMatch[1]);
        mode = "notes";
        currentAlternative = "";
        continue;
      }
      if (mode === "alternative" && currentAlternative) alternatives[currentAlternative] += ` ${line}`;
      else if (mode === "comment") comments.push(line);
      else if (mode === "foundation") foundations.push(line);
      else if (mode === "answer" || mode === "notes") notes.push(line.replace(/^\*\*|\*\*$/g, ""));
      else prompt.push(line);
    }

    const number = Number(code.match(/(\d+)$/)?.[1] || 0);
    return {
      id: `consol-${meta.code.toLowerCase()}-${String(number).padStart(2, "0")}`,
      codigo: `CONSOL-${meta.code}-${String(number).padStart(2, "0")}`,
      numero: number,
      assunto: meta.name.replace(/^Simulado\s+[A-Z0-9]+\s+—\s+/, ""),
      subassunto: "",
      texto_base: textBase,
      enunciado: clean(prompt.join(" ")),
      alternativas: Object.fromEntries(["A", "B", "C", "D", "E"].map(letter => [letter, clean(alternatives[letter])])),
      gabarito: answer,
      comentario: clean(comments.join(" ")),
      fundamento: clean(foundations.join(" ")),
      pegadinha: "",
      observacoes: clean(notes.join(" ")),
      fonte_consolidada: meta.source_url,
      auditoria: "CONSOL01 — versão final saneada",
    };
  }

  function parseMarkdownMaterial(meta, markdown) {
    const parts = markdown.split(/^###\s+([A-Z0-9]+-\d+)\s*$/gm);
    const textBase = extractTextBase(markdown);
    const questions = [];
    for (let index = 1; index < parts.length; index += 2) {
      questions.push(parseMarkdownQuestion(parts[index], parts[index + 1] || "", meta, textBase));
    }
    return materialShell(meta, questions);
  }

  function validateMaterial(meta, material) {
    if (!material || material.id !== `sim-emilia-2026-tdas-${meta.code.toLowerCase()}`) throw new Error(`${meta.code}: ID do material divergente.`);
    if (!Array.isArray(material.questoes) || material.questoes.length !== Number(meta.count)) throw new Error(`${meta.code}: esperado ${meta.count}, encontrado ${material.questoes?.length || 0}.`);
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
    const materials = await Promise.all(responses.map(async (response, position) => {
      const meta = index.materials[position];
      const material = meta.file.endsWith(".md")
        ? parseMarkdownMaterial(meta, await response.text())
        : await response.json();
      return validateMaterial(meta, material);
    }));
    const total = materials.reduce((sum, material) => sum + material.questoes.length, 0);
    if (total !== Number(index.expected_questions)) throw new Error(`Lote consolidado: esperado ${index.expected_questions}, encontrado ${total}.`);
    return {index, materials};
  });

  const metadata = material => {
    const {questoes, ...rest} = material;
    return rest;
  };

  window.fetch = async (input, init = {}) => {
    const requestedUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url, window.location.href).href;
    if (requestedUrl === catalogUrl) {
      const response = await previousFetch(input, {...init, cache: "no-store"});
      if (!response.ok) return response;
      try {
        const [catalog, consolidated] = await Promise.all([response.json(), loadConsolidated()]);
        const retained = (catalog.materials || []).filter(material => !partialIds.has(material.id));
        const materials = [...retained, ...consolidated.materials.map(metadata)];
        const questoes = materials.reduce((sum, material) => sum + Number(material.quantidade_questoes || 0), 0);
        if (questoes !== 570 || materials.length !== 35) throw new Error(`Catálogo final inválido: ${questoes}/${materials.length}.`);
        return new Response(JSON.stringify({
          ...catalog,
          schema_version: "4.0",
          exported_at: "2026-07-29T22:30:00-03:00",
          source: {...catalog.source, criteria: "570 questões consolidadas no CONSOL01; 300 inserções recentes aguardam auditoria."},
          summary: {banco_mestre: 870, materiais: 35, questoes: 570, aguardando_exportacao: 300, provas: 0, simulados: 35},
          materials,
          consolidated_source: consolidated.index.source_url,
        }), {status: 200, headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}});
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
          const position = bundle.materials.findIndex(item => item.id === material.id);
          if (position >= 0) bundle.materials[position] = material; else bundle.materials.push(material);
        }
        const total = bundle.materials.reduce((sum, material) => sum + (material.questoes || []).length, 0);
        if (total !== 570 || bundle.materials.length !== 35) throw new Error(`Banco final inválido: ${total}/${bundle.materials.length}.`);
        bundle.exported_at = "2026-07-29T22:30:00-03:00";
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
