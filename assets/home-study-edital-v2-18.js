const COMMON_DISCIPLINES = [
  "lingua portuguesa",
  "distrito federal",
  "ride",
  "primeiros socorros",
  "politicas para mulheres",
  "seguranca alimentar",
  "legislacao do distrito federal",
];

const COMMON_TOPICS = [
  "ride",
  "distrito federal",
  "plano distrital de politica para mulheres",
  "pdpm",
  "maria da penha",
  "lei 11.340",
  "lodf",
  "lei organica do distrito federal",
  "lc 840",
  "lei complementar 840",
  "primeiros socorros",
  "programas sociais do df",
  "beneficios eventuais",
  "sisan",
  "seguranca alimentar",
  "restaurante comunitario",
  "lei 7.484",
];

export const TARGETS = {
  "202": {
    label: "Técnico Administrativo",
    subtitle: "Cargo 202 · TDAS",
    disciplines: [
      ...COMMON_DISCIPLINES,
      "direito administrativo",
      "administracao publica",
      "direito constitucional",
      "arquivologia",
      "redacao oficial",
      "atendimento ao publico",
      "administracao de materiais",
      "gestao de materiais",
      "recursos materiais",
      "gestao patrimonial",
      "patrimonio",
      "licitacoes",
      "compras publicas",
    ],
    topics: [
      ...COMMON_TOPICS,
      "administrativo",
      "atos administrativos",
      "agentes publicos",
      "provimento",
      "vacancia",
      "direitos e deveres",
      "responsabilidade",
      "processo administrativo disciplinar",
      "pad",
      "suas",
      "pnas",
      "nob/suas",
      "nob suas",
      "segurancas socioassistenciais",
      "protocolo",
      "classificacao de documentos",
      "metodos de arquivamento",
      "preservacao documental",
      "digitalizacao",
      "atendimento ao publico",
      "trabalho em equipe",
      "redacao oficial",
      "comunicacoes administrativas",
      "classificacao de materiais",
      "estoque",
      "armazenagem",
      "tombamento",
      "inventario patrimonial",
      "baixa patrimonial",
      "compras publicas",
      "lei 14.133",
      "licitacao",
      "contratacao publica",
    ],
  },
  "400": {
    label: "Administrador",
    subtitle: "Cargo 400 · EDAS Administração",
    disciplines: [
      ...COMMON_DISCIPLINES,
      "administracao",
      "administracao geral",
      "teorias da administracao",
      "administracao publica",
      "gestao publica",
      "gestao organizacional",
      "gestao de pessoas",
      "gestao de projetos",
      "gestao de riscos",
      "administracao financeira e orcamentaria",
      "afo",
      "orcamento publico",
      "financas publicas",
      "organizacao sistemas e metodos",
      "os&m",
      "qualidade",
    ],
    topics: [
      ...COMMON_TOPICS,
      "suas",
      "loas",
      "pnas",
      "nob/suas",
      "nob suas",
      "siafem",
      "administracao por objetivos",
      "apo",
      "processo decisorio",
      "descentralizacao",
      "delegacao",
      "arquitetura organizacional",
      "estrutura organizacional",
      "modelos de excelencia em gestao publica",
      "planejamento",
      "indicadores",
      "qualidade",
      "gestao de pessoas",
      "gestao por competencias",
      "analise e descricao de cargos",
      "cargos carreiras e salarios",
      "motivacao",
      "etica",
      "gestao de projetos",
      "gestao de riscos",
      "mrosc",
      "cadunico",
      "cadastro unico",
      "controle social",
      "orcamento",
      "afo",
    ],
  },
};

export const TRACKS = [
  {id: "prova-202", type: "prova", target: "202", label: "Provas 202", eyebrow: "Provas anteriores", icon: "P"},
  {id: "prova-400", type: "prova", target: "400", label: "Provas 400", eyebrow: "Provas anteriores", icon: "P"},
  {id: "simulado-202", type: "simulado", target: "202", label: "Simulados 202", eyebrow: "Simulados", icon: "S"},
  {id: "simulado-400", type: "simulado", target: "400", label: "Simulados 400", eyebrow: "Simulados", icon: "S"},
];

export const normalizeStudyValue = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/\s+/g, " ")
  .trim();

function includesAny(text, terms) {
  const value = normalizeStudyValue(text);
  return terms.some(term => value.includes(normalizeStudyValue(term)));
}

function matchesDiscipline(name, terms) {
  const value = normalizeStudyValue(name);
  return terms.some(term => {
    const expected = normalizeStudyValue(term);
    return value === expected || value.startsWith(`${expected} `) || value.endsWith(` ${expected}`);
  });
}

export function targetQuestionIdsForStudyIndex(studyIndex, targetCode) {
  const target = TARGETS[targetCode];
  const result = new Set();
  if (!target) return result;
  for (const discipline of studyIndex?.disciplines || []) {
    if (matchesDiscipline(discipline.name, target.disciplines)) {
      (discipline.question_ids || []).forEach(id => result.add(id));
      continue;
    }
    for (const topic of discipline.topics || []) {
      if (includesAny(`${discipline.name} ${topic.name}`, target.topics)) {
        (topic.question_ids || []).forEach(id => result.add(id));
      }
    }
  }
  return result;
}

export function sessionMaterialTypeForTracks(tracks) {
  const active = (tracks || []).filter(Boolean);
  return active.length > 0 && active.every(track => track.type === "prova") ? "prova" : "simulado";
}
