import fs from 'node:fs';

const TOKEN = process.env.NOTION_TOKEN;
const SOURCE = '784234ae-deca-4514-b60d-19524e122a89';
const API = 'https://api.notion.com/v1';
const VERSION = '2026-03-11';
const MATERIAL = 'Administrador — CRF-DF — Quadrix 2026';
const PREFIX = 'PROVA-QDX-CRFDF-2026-ADMINISTRADOR-400-';
const PUBLICATION_DATE = '2026-07-30';
const REVIEW_DATE = '2026-07-31';
const PUBLIC_BASE = 'https://rodrigorosadantas.github.io/sedes-df-questoes/';
const REPORT_PATH = 'artifacts/saneamento-administrador-crfdf-20260731.json';

if (!TOKEN) throw new Error('NOTION_TOKEN não disponível.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value ?? '').trim();
const richText = items => (items || []).map(item => item.plain_text ?? item.text?.content ?? '').join('').trim();
const answer = letter => letter === 'C' ? 'Certo' : 'Errado';
const codeFor = number => `${PREFIX}${String(number).padStart(3, '0')}`;
const expectedLetters = [
  'C','E','C','E','C','C','C','E','C','C','C','E','E','E','C','E','E','C','E','C',
  'E','E','C','C','C','C','E','C','E','E','E','C','E','C','C','E','E','C','E','C',
  'C','C','E','E','C','C','E','E','C','E','C','C','E','E','C','C','E','C','E','C',
  'C','C','E','E','C','E','C','C','E','E','C','E','E','E','E','C','C','C','E','E',
  'E','C','E','C','E','E','C','C','C','C','E','E','E','E','C','C','C','C','E','E',
  'E','C','E','C','E','E','C','C','C','E','E','C','E','C','C','E','E','E','C','C',
];
const expectedAnswers = expectedLetters.map(answer);

const groups = {
  projetos: 'No que concerne à gestão de projetos nas organizações públicas, julgue os itens seguintes.',
  pessoas: 'No que se refere à gestão de pessoas nas organizações públicas, julgue os itens a seguir.',
  qualidade: 'Com relação à gestão da qualidade nas organizações, julgue os itens seguintes.',
  afo: 'No que diz respeito à administração financeira e orçamentária nas organizações, julgue os itens a seguir.',
  admPublica: 'Quanto aos aspectos da Administração Pública brasileira, julgue os itens seguintes.',
  contratos: 'No que concerne à elaboração e análise de contratos administrativos, julgue os itens a seguir.',
  licitacoes: 'Acerca das licitações públicas, julgue os itens seguintes.',
  riscos: 'No que se refere à gestão de riscos e ao compliance nas organizações públicas, julgue os itens a seguir.',
  lrf: 'De acordo com a Lei Complementar nº 101/2000, julgue os itens seguintes.',
  estrategia: 'No que diz respeito ao planejamento e à gestão estratégica nas organizações públicas, julgue os itens a seguir.',
};

const official = new Map([
  [83, {
    textBase: groups.projetos,
    prompt: 'O escopo funcional envolve as características técnicas do projeto, destacando as referências e os parâmetros a serem usados, os instrumentos legais a serem obedecidos e os procedimentos de qualidade requisitados.',
    assunto: 'Gestão de projetos', subassunto: 'Escopo funcional e escopo técnico',
    comment: 'O item está errado. As características técnicas, as referências, os parâmetros, os instrumentos legais e os procedimentos de qualidade integram o escopo técnico. O escopo funcional descreve as funções, capacidades e entregas esperadas do produto ou serviço.',
    foundation: 'Gestão de projetos — distinção entre escopo funcional e escopo técnico.',
    trap: 'Trocar as funções esperadas do projeto pelas especificações técnicas e normativas.',
  }],
  [84, {
    textBase: groups.projetos,
    prompt: 'O gerenciamento de riscos do projeto deve abarcar a identificação dos elementos do projeto sujeitos a risco, a identificação dos impactos e, inclusive, a priorização das ameaças e fraquezas.',
    assunto: 'Gestão de projetos', subassunto: 'Gerenciamento de riscos do projeto',
    comment: 'O item está certo. O gerenciamento de riscos compreende identificar os elementos expostos, analisar impactos e probabilidades e priorizar ameaças e vulnerabilidades para definir respostas e controles proporcionais.',
    foundation: 'Gestão de projetos — identificação, análise, priorização e resposta aos riscos.',
    trap: 'Reduzir a gestão de riscos à reação posterior ao evento danoso.',
  }],
  [85, {
    textBase: groups.pessoas,
    prompt: 'O planejamento de recursos humanos é tarefa privativa do setor de gestão de pessoas, focando sobretudo no curto prazo para garantir a reposição imediata de colaboradores faltantes na organização.',
    assunto: 'Gestão de pessoas', subassunto: 'Planejamento de recursos humanos',
    comment: 'O item está errado. O planejamento de pessoas é estratégico e compartilhado com as áreas organizacionais, considera necessidades presentes e futuras e não se limita à reposição imediata de pessoal nem constitui atribuição privativa do setor de gestão de pessoas.',
    foundation: 'Gestão estratégica de pessoas — planejamento integrado às necessidades organizacionais.',
    trap: 'Tratar planejamento de pessoas como atividade isolada, operacional e apenas de curto prazo.',
  }],
  [86, {
    textBase: groups.pessoas,
    prompt: 'A avaliação de desempenho focada no futuro, comum na gestão de talentos, baseia-se precipuamente na análise do histórico funcional do servidor para a sua progressão funcional.',
    assunto: 'Gestão de pessoas', subassunto: 'Avaliação de desempenho e gestão de talentos',
    comment: 'O item está errado. A avaliação voltada ao futuro privilegia potencial, competências, desenvolvimento e resultados esperados. A análise predominante do histórico funcional caracteriza orientação retrospectiva, não prospectiva.',
    foundation: 'Gestão de talentos — avaliação prospectiva de potencial, competências e desenvolvimento.',
    trap: 'Chamar de avaliação futura um procedimento centrado no passado funcional.',
  }],
  [87, {
    textBase: groups.pessoas,
    prompt: 'A gestão por competências visa transformar a cultura burocrática em orgânica, alinhando competências individuais às estratégias institucionais para aumentar a eficiência da prestação de serviços.',
    assunto: 'Gestão de pessoas', subassunto: 'Gestão por competências',
    comment: 'O item está certo. A gestão por competências identifica e desenvolve conhecimentos, habilidades e atitudes necessários à estratégia, aproximando capacidades individuais e institucionais e favorecendo maior flexibilidade e eficiência.',
    foundation: 'Gestão por competências — alinhamento entre competências individuais, organizacionais e estratégia.',
    trap: 'Supor que a gestão por competências se limita a treinamento ou descrição de cargos.',
  }],
  [88, {
    textBase: groups.pessoas,
    prompt: 'A cultura organizacional tende a ser estável e burocrática, agindo como um iceberg, em que os aspectos invisíveis – tais como valores e crenças compartilhados – são os mais difíceis de alterar.',
    assunto: 'Gestão de pessoas', subassunto: 'Cultura organizacional',
    comment: 'O item está certo. Na metáfora do iceberg, artefatos e manifestações visíveis ocupam a superfície, enquanto valores, crenças e pressupostos permanecem em níveis profundos e apresentam maior resistência à mudança.',
    foundation: 'Cultura organizacional — níveis visíveis e invisíveis e metáfora do iceberg.',
    trap: 'Acreditar que valores e crenças são os elementos mais aparentes e fáceis de modificar.',
  }],
  [89, {
    textBase: groups.qualidade,
    prompt: 'Um dos principais pilares da gestão da qualidade é o foco no cliente, uma vez que a qualidade é pensada para o consumidor e medida com base em sua satisfação.',
    assunto: 'Gestão da qualidade', subassunto: 'Foco no cliente',
    comment: 'O item está certo. O foco no cliente ou usuário é princípio central da gestão da qualidade, pois requisitos, percepção de valor e satisfação orientam o desenho, a entrega e a melhoria dos produtos e serviços.',
    foundation: 'Gestão da qualidade — foco no cliente e mensuração da satisfação.',
    trap: 'Restringir qualidade à conformidade interna do processo, ignorando a percepção do usuário.',
  }],
  [90, {
    textBase: groups.qualidade,
    prompt: 'Deming postulou o princípio do estabelecimento de constância de propósitos para a melhoria do produto e do serviço, objetivando tornar a organização competitiva, gerando lucro.',
    assunto: 'Gestão da qualidade', subassunto: 'Princípios de Deming',
    comment: 'O item está certo. Entre os princípios de Deming está a constância de propósito para melhorar produtos e serviços, manter a competitividade e assegurar a continuidade da organização, o que inclui sua sustentabilidade econômica.',
    foundation: 'Gestão da qualidade — constância de propósito nos princípios de W. Edwards Deming.',
    trap: 'Considerar incompatíveis melhoria contínua, competitividade e resultado econômico.',
  }],
  [91, {
    textBase: groups.qualidade,
    prompt: 'O modelo de excelência em gestão propalado pela Fundação Nacional da Qualidade caracteriza-se pela aprendizagem organizacional, pelo pensamento departamental e pela liderança transformadora.',
    assunto: 'Gestão da qualidade', subassunto: 'Modelo de Excelência da Gestão',
    comment: 'O item está errado. O Modelo de Excelência da Gestão valoriza pensamento sistêmico, aprendizagem organizacional e liderança transformadora. A expressão “pensamento departamental” contraria a integração e a visão sistêmica defendidas pelo modelo.',
    foundation: 'Fundação Nacional da Qualidade — Modelo de Excelência da Gestão e pensamento sistêmico.',
    trap: 'Substituir pensamento sistêmico por pensamento departamental.',
  }],
  [92, {
    textBase: groups.qualidade,
    prompt: 'Os atributos dos indicadores de desempenho nas organizações encerram-se em serem mensuráveis, confiáveis e relevantes.',
    assunto: 'Gestão da qualidade', subassunto: 'Indicadores de desempenho',
    comment: 'O item está errado. Mensurabilidade, confiabilidade e relevância são atributos importantes, mas não esgotam os requisitos dos indicadores, que também podem exigir simplicidade, comparabilidade, tempestividade, acessibilidade, sensibilidade e economicidade.',
    foundation: 'Gestão do desempenho — requisitos de qualidade dos indicadores.',
    trap: 'Usar expressão excludente para transformar uma lista exemplificativa em taxativa.',
  }],
  [93, {
    textBase: groups.afo,
    prompt: 'A estrutura de capital refere-se às decisões a respeito dos investimentos que comporão o ativo da organização, tais como prédios e instalações, máquinas, equipamentos e veículos.',
    assunto: 'Administração financeira e orçamentária', subassunto: 'Estrutura de capital e orçamento de capital',
    comment: 'O item está errado. Estrutura de capital diz respeito à combinação de fontes de financiamento, como capital próprio e capital de terceiros. A escolha de prédios, máquinas, equipamentos e veículos integra decisões de investimento ou orçamento de capital.',
    foundation: 'Administração financeira — estrutura de capital e decisões de investimento.',
    trap: 'Confundir a origem dos recursos com a aplicação dos recursos em ativos.',
  }],
  [94, {
    textBase: groups.afo,
    prompt: 'O princípio do orçamento bruto reconhece a coexistência de diversos orçamentos, que devem ser consolidados, a fim de que o governo visualize o conjunto das finanças públicas.',
    assunto: 'Administração financeira e orçamentária', subassunto: 'Princípios orçamentários',
    comment: 'O item está errado. O orçamento bruto exige que receitas e despesas constem pelos valores totais, sem deduções. A ideia de reunião e consolidação dos diversos orçamentos relaciona-se ao princípio da unidade ou totalidade.',
    foundation: 'Lei nº 4.320/1964, art. 6º — registro das receitas e despesas pelos totais, vedadas deduções.',
    trap: 'Trocar o princípio do orçamento bruto pelo princípio da unidade ou totalidade.',
  }],
  [95, {
    textBase: groups.afo,
    prompt: 'Diferente do setor privado, a análise de investimentos nas organizações públicas foca na rentabilidade social e no impacto socioeconômico, priorizando benefícios para a coletividade sobre o retorno financeiro direto.',
    assunto: 'Administração financeira e orçamentária', subassunto: 'Análise de investimentos públicos',
    comment: 'O item está certo. A decisão pública de investimento deve considerar retorno social, impacto socioeconômico, efetividade e geração de valor coletivo, sem se limitar à rentabilidade financeira direta típica de avaliações privadas.',
    foundation: 'Administração pública — avaliação socioeconômica e geração de valor público.',
    trap: 'Aplicar exclusivamente a lógica de retorno financeiro privado aos investimentos públicos.',
  }],
  [96, {
    textBase: groups.afo,
    prompt: 'A liquidez na Administração Pública prioriza a capacidade imediata de pagar as despesas correntes, utilizando indicadores que consideram a disponibilidade de caixa líquida.',
    assunto: 'Administração financeira e orçamentária', subassunto: 'Liquidez e disponibilidade de caixa',
    comment: 'O item está certo. Liquidez expressa a capacidade de cumprir obrigações de curto prazo, e sua análise considera disponibilidades financeiras líquidas em relação aos compromissos correntes.',
    foundation: 'Administração financeira — liquidez e capacidade de pagamento de curto prazo.',
    trap: 'Confundir liquidez com rentabilidade ou equilíbrio orçamentário de longo prazo.',
  }],
  [97, {
    textBase: groups.admPublica,
    prompt: 'O princípio da impessoalidade determina que a atuação administrativa deve ser pautada na isonomia e na finalidade pública, vedando a promoção pessoal de agentes públicos em obras e publicidades oficiais.',
    assunto: 'Administração Pública', subassunto: 'Princípio da impessoalidade',
    comment: 'O item está certo. A impessoalidade exige atuação orientada ao interesse público e tratamento isonômico, além de impedir que publicidade oficial seja utilizada para promoção pessoal de autoridades ou servidores.',
    foundation: 'Constituição Federal, art. 37, caput e § 1º.',
    trap: 'Reduzir impessoalidade apenas à ausência de identificação nominal nos atos.',
  }],
  [98, {
    textBase: groups.admPublica,
    prompt: 'A governança pública, distintamente da governabilidade, envolve mecanismos de liderança, estratégia e controle, incluindo a transparência e a accountability para garantir o interesse público.',
    assunto: 'Administração Pública', subassunto: 'Governança e governabilidade',
    comment: 'O item está certo. Governança pública compreende mecanismos de liderança, estratégia e controle destinados a avaliar, direcionar e monitorar a gestão, com transparência e accountability. Governabilidade refere-se às condições políticas e institucionais de exercício do governo.',
    foundation: 'Governança pública — liderança, estratégia, controle, transparência e accountability.',
    trap: 'Tratar governança e governabilidade como conceitos equivalentes.',
  }],
  [99, {
    textBase: groups.admPublica,
    prompt: 'A implantação da gestão por resultados na Administração Pública visa substituir a burocracia, adotando um modelo de controle prévio rigoroso, em que todas as ações devem ser autorizadas centralmente antes de sua execução.',
    assunto: 'Administração Pública', subassunto: 'Gestão por resultados',
    comment: 'O item está errado. A gestão por resultados desloca o foco para objetivos, indicadores e entregas, amplia responsabilização e autonomia gerencial e privilegia controle de desempenho. Não institui autorização prévia centralizada de todas as ações.',
    foundation: 'Administração gerencial — gestão por resultados, autonomia e controle de desempenho.',
    trap: 'Apresentar centralização e controle prévio rígido como traços da gestão por resultados.',
  }],
  [100, {
    textBase: groups.admPublica,
    prompt: 'A implementação do governo eletrônico baseia-se na padronização de todos os portais dos órgãos públicos federais, estaduais e municipais em uma única plataforma, subtraindo a autonomia tecnológica de cada ente federativo.',
    assunto: 'Administração Pública', subassunto: 'Governo eletrônico e transformação digital',
    comment: 'O item está errado. Governo eletrônico busca digitalização, integração, interoperabilidade, acesso e eficiência, mas não exige uma única plataforma nacional nem elimina a autonomia tecnológica dos entes federativos.',
    foundation: 'Transformação digital no setor público — interoperabilidade, integração e autonomia federativa.',
    trap: 'Confundir interoperabilidade com uniformização absoluta em plataforma única.',
  }],
  [101, {
    textBase: groups.contratos,
    prompt: 'O instrumento de contrato é obrigatório para todas as contratações das organizações públicas, sendo nula a contratação realizada apenas por nota de empenho.',
    assunto: 'Contratos administrativos', subassunto: 'Formalização e substituição do instrumento contratual',
    comment: 'O item está errado. A Lei nº 14.133/2021 admite, nas hipóteses legais, a substituição do instrumento de contrato por carta-contrato, nota de empenho, autorização de compra ou ordem de execução de serviço.',
    foundation: 'Lei nº 14.133/2021, art. 95.',
    trap: 'Transformar a obrigatoriedade do contrato formal em regra absoluta, ignorando substitutos legais.',
  }],
  [102, {
    textBase: groups.contratos,
    prompt: 'A fiscalização do contrato administrativo é obrigação do Poder Público, que deve designar representante para acompanhar a execução técnica, sem que isso reduza a responsabilidade da contratada perante terceiros.',
    assunto: 'Contratos administrativos', subassunto: 'Gestão e fiscalização contratual',
    comment: 'O item está certo. A Administração deve designar fiscal ou fiscais para acompanhar e registrar a execução. A fiscalização pública não exclui nem reduz a responsabilidade da contratada pelos danos decorrentes da execução.',
    foundation: 'Lei nº 14.133/2021, arts. 117 e 120.',
    trap: 'Supor que a fiscalização transfere à Administração a responsabilidade própria da contratada.',
  }],
  [103, {
    textBase: groups.contratos,
    prompt: 'A cláusula que estabelece a matriz de riscos é facultativa em contratos de grande vulto, uma vez que o equilíbrio econômico-financeiro é garantido constitucionalmente, independentemente de previsão contratual expressa acerca da repartição de ônus.',
    assunto: 'Contratos administrativos', subassunto: 'Matriz de alocação de riscos',
    comment: 'O item está errado. Nas contratações de grande vulto, a matriz de alocação de riscos deve constar do edital e do contrato, distribuindo objetivamente responsabilidades e efeitos econômicos entre as partes.',
    foundation: 'Lei nº 14.133/2021, art. 22, § 3º, e art. 92, IX.',
    trap: 'Usar a garantia do equilíbrio econômico-financeiro para afastar uma matriz de riscos legalmente obrigatória.',
  }],
  [104, {
    textBase: groups.contratos,
    prompt: 'A inexecução parcial do contrato, ainda que culposa pela contratada, não autoriza a rescisão unilateral imediata se não restar demonstrado o prejuízo à continuidade do serviço público ou a ineficiência da execução contratual.',
    assunto: 'Contratos administrativos', subassunto: 'Extinção unilateral por inexecução',
    comment: 'O item está certo. A inexecução parcial não produz extinção unilateral automática em qualquer hipótese; a medida deve apoiar-se em enquadramento legal, motivação, gravidade e repercussão concreta sobre a execução e o interesse público.',
    foundation: 'Lei nº 14.133/2021, arts. 137 e 138 — hipóteses e formalização da extinção contratual.',
    trap: 'Tratar qualquer falha parcial como causa automática e imediata de extinção unilateral.',
  }],
  [105, {
    textBase: groups.licitacoes,
    prompt: 'O leilão é a modalidade de licitação para a alienação de bens imóveis ou de bens móveis inservíveis e bens e serviços comuns a quem oferecer o maior lance.',
    assunto: 'Licitações públicas', subassunto: 'Modalidade leilão',
    comment: 'O item está errado. O leilão destina-se à alienação de bens imóveis ou de bens móveis inservíveis ou legalmente apreendidos a quem oferecer o maior lance. Bens e serviços comuns são contratados, em regra, por pregão.',
    foundation: 'Lei nº 14.133/2021, art. 6º, XL, e art. 29.',
    trap: 'Inserir bens e serviços comuns no objeto da modalidade leilão.',
  }],
  [106, {
    textBase: groups.licitacoes,
    prompt: 'É dispensável a licitação no caso de locação de imóvel cujas características de instalações e de localização tornem necessária a sua escolha.',
    assunto: 'Licitações públicas', subassunto: 'Inexigibilidade para locação de imóvel',
    comment: 'O item está errado. Quando as características de instalações e localização tornam necessária a escolha de determinado imóvel, a hipótese é de inexigibilidade, desde que atendidos os requisitos legais, e não de dispensa.',
    foundation: 'Lei nº 14.133/2021, art. 74, V e § 5º.',
    trap: 'Trocar inexigibilidade por dispensa na escolha necessária de imóvel.',
  }],
  [107, {
    textBase: groups.licitacoes,
    prompt: 'O pregão sempre deve ser adotado quando o objeto contratual possuir padrões de desempenho e qualidade que possam ser objetivamente definidos pelo edital, mediante especificações usuais de mercado.',
    assunto: 'Licitações públicas', subassunto: 'Pregão e bens e serviços comuns',
    comment: 'O item está certo. O pregão é a modalidade obrigatória para aquisição de bens e contratação de serviços comuns, cujos padrões de desempenho e qualidade possam ser objetivamente definidos por especificações usuais de mercado.',
    foundation: 'Lei nº 14.133/2021, art. 6º, XLI, e art. 29.',
    trap: 'Afastar o pregão mesmo quando o objeto é comum e objetivamente especificável.',
  }],
  [108, {
    textBase: groups.licitacoes,
    prompt: 'Em regra, o edital de licitação para o registro de preços deve dispor sobre a quantidade máxima de cada item que pode ser adquirida e a possibilidade de prever preços diferentes quando o objeto for entregue em locais diferentes.',
    assunto: 'Licitações públicas', subassunto: 'Sistema de registro de preços',
    comment: 'O item está certo. O edital do registro de preços deve indicar as quantidades máximas e pode admitir preços diferentes em razão do local de entrega, entre outras situações previstas em lei.',
    foundation: 'Lei nº 14.133/2021, art. 82, I e III.',
    trap: 'Supor que a ata deve conter preço único mesmo quando locais de entrega alteram os custos.',
  }],
  [109, {
    textBase: groups.riscos,
    prompt: 'A gestão de riscos no setor público não visa eliminar todas as incertezas, mas, sim, identificar, avaliar e mitigar ameaças que possam comprometer a entrega de valor, resultados e serviços à sociedade, alinhando-se à governança.',
    assunto: 'Gestão de riscos e compliance', subassunto: 'Gestão de riscos no setor público',
    comment: 'O item está certo. A gestão de riscos não elimina toda incerteza; ela identifica, analisa, avalia e trata eventos que possam afetar objetivos e entrega de valor, integrando-se aos mecanismos de governança.',
    foundation: 'Gestão de riscos no setor público — identificação, avaliação, tratamento e integração à governança.',
    trap: 'Exigir eliminação total do risco como objetivo da gestão de riscos.',
  }],
  [110, {
    textBase: groups.riscos,
    prompt: 'A etapa de identificação de riscos deve ser realizada prioritariamente após a ocorrência do evento danoso, permitindo que a organização pública utilize dados históricos reais para catalogar as ameaças e as vulnerabilidades administrativas.',
    assunto: 'Gestão de riscos e compliance', subassunto: 'Identificação de riscos',
    comment: 'O item está errado. A identificação deve ser proativa, sistemática e contínua, antes da materialização dos eventos, embora dados históricos e lições aprendidas possam subsidiar o processo.',
    foundation: 'Processo de gestão de riscos — identificação preventiva e contínua.',
    trap: 'Transformar aprendizagem posterior em momento prioritário para identificar riscos.',
  }],
  [111, {
    textBase: groups.riscos,
    prompt: 'O programa de compliance pública foca primordialmente na detecção de fraudes financeiras, sendo a gestão de riscos de corrupção uma etapa posterior e independente das diretrizes de governança e controles internos.',
    assunto: 'Gestão de riscos e compliance', subassunto: 'Compliance e integridade pública',
    comment: 'O item está errado. Compliance e integridade pública possuem caráter preventivo e abrangente e devem integrar governança, gestão de riscos de fraude e corrupção, controles internos, ética, transparência e responsabilização.',
    foundation: 'Integridade pública — prevenção, gestão de riscos, controles internos e governança.',
    trap: 'Reduzir compliance à detecção financeira e separar corrupção, governança e controles.',
  }],
  [112, {
    textBase: groups.riscos,
    prompt: 'A segregação de funções constitui princípio metodológico do controle interno, que consiste em separar as atividades de autorização, execução, registro e custódia de ativos entre diferentes servidores para mitigar riscos.',
    assunto: 'Gestão de riscos e compliance', subassunto: 'Segregação de funções',
    comment: 'O item está certo. A segregação distribui funções incompatíveis entre agentes distintos, reduzindo concentração de poder, erros, conflitos de interesse e oportunidades de fraude.',
    foundation: 'Controle interno — segregação entre autorização, execução, registro e custódia.',
    trap: 'Concentrar etapas incompatíveis em um único agente sob o argumento de eficiência.',
  }],
  [113, {
    textBase: groups.lrf,
    prompt: 'A lei de diretrizes orçamentárias pode dispor a respeito da exclusão de quaisquer despesas primárias da apuração da meta de resultado primário dos orçamentos fiscal e da seguridade social.',
    assunto: 'Lei de Responsabilidade Fiscal e orçamento público', subassunto: 'Meta de resultado primário',
    comment: 'O item está errado. A Lei de Responsabilidade Fiscal veda à LDO excluir quaisquer despesas primárias da apuração da meta de resultado primário dos orçamentos fiscal e da seguridade social.',
    foundation: 'Lei Complementar nº 101/2000, art. 4º, § 7º.',
    trap: 'Trocar uma proibição expressa por autorização ampla da LDO.',
  }],
  [114, {
    textBase: groups.lrf,
    prompt: 'Todas as despesas relativas à dívida pública, mobiliária ou contratual, e as receitas que as atenderão, devem constar da lei orçamentária anual.',
    assunto: 'Lei de Responsabilidade Fiscal e orçamento público', subassunto: 'Dívida pública na LOA',
    comment: 'O item está certo. A lei orçamentária anual deve conter todas as despesas relativas à dívida pública, mobiliária ou contratual, e as receitas destinadas a atendê-las.',
    foundation: 'Lei Complementar nº 101/2000, art. 5º, § 1º.',
    trap: 'Admitir que despesas ou receitas da dívida fiquem fora da LOA.',
  }],
  [115, {
    textBase: groups.lrf,
    prompt: 'Tributo é a receita derivada instituída pelas entidades de direito público, compreendendo os impostos, as taxas e as contribuições, destinando-se o seu produto ao custeio de atividades gerais ou específicas exercidas por essas entidades.',
    assunto: 'Lei de Responsabilidade Fiscal e orçamento público', subassunto: 'Receita tributária',
    comment: 'O item está certo. A afirmação reproduz a definição legal de tributo como receita derivada instituída por entidades de direito público, abrangendo impostos, taxas e contribuições destinadas ao custeio de atividades gerais ou específicas.',
    foundation: 'Lei nº 4.320/1964, art. 9º.',
    trap: 'Confundir receita tributária derivada com receita originária patrimonial.',
  }],
  [116, {
    textBase: groups.lrf,
    prompt: 'As contas de “aquisição de imóveis” e “constituição de fundos rotativos” pertencem à categoria de inversões financeiras, enquanto as contas de “concessão de empréstimos” e “amortização da dívida pública” referem-se à categoria de transferência de capital.',
    assunto: 'Lei de Responsabilidade Fiscal e orçamento público', subassunto: 'Classificação da despesa de capital',
    comment: 'O item está errado. Aquisição de imóveis, constituição de fundos rotativos e concessão de empréstimos são inversões financeiras. A amortização da dívida é transferência de capital. O item classifica incorretamente a concessão de empréstimos.',
    foundation: 'Lei nº 4.320/1964, art. 12, §§ 5º e 6º.',
    trap: 'Colocar concessão de empréstimos entre as transferências de capital.',
  }],
  [117, {
    textBase: groups.estrategia,
    prompt: 'O planejamento estratégico é inerte e, uma vez definido em lei orçamentária, impede revisões táticas durante o ciclo administrativo para garantir a total segurança jurídica das decisões.',
    assunto: 'Planejamento e gestão estratégica', subassunto: 'Natureza dinâmica do planejamento',
    comment: 'O item está errado. O planejamento estratégico é dinâmico, sujeito a monitoramento, aprendizagem e revisão diante de mudanças de cenário. A lei orçamentária não o torna inerte nem impede ajustes táticos durante a execução.',
    foundation: 'Planejamento estratégico — monitoramento, revisão e adaptação ao ambiente.',
    trap: 'Confundir estabilidade de objetivos com imutabilidade do planejamento.',
  }],
  [118, {
    textBase: groups.estrategia,
    prompt: 'O diagnóstico estratégico deve focar, prioritariamente, na análise das variáveis internas controláveis da organização pública, visto que os fatores externos são imutáveis e independem da capacidade de resposta ou de intervenção da gestão institucional.',
    assunto: 'Planejamento e gestão estratégica', subassunto: 'Diagnóstico estratégico e análise ambiental',
    comment: 'O item está errado. O diagnóstico estratégico examina ambiente interno e externo. Oportunidades e ameaças externas podem mudar e, embora não sejam controladas diretamente, exigem monitoramento e respostas organizacionais.',
    foundation: 'Planejamento estratégico — análise SWOT e ambientes interno e externo.',
    trap: 'Desprezar fatores externos por serem menos controláveis.',
  }],
  [119, {
    textBase: groups.estrategia,
    prompt: 'O Balanced Scorecard facilita a operacionalização da estratégia ao desdobrar a visão em objetivos, indicadores e iniciativas, com o cidadão ocupando, geralmente, a perspectiva superior na relação de causa e efeito.',
    assunto: 'Planejamento e gestão estratégica', subassunto: 'Balanced Scorecard no setor público',
    comment: 'O item está certo. O Balanced Scorecard traduz visão e estratégia em objetivos, indicadores, metas e iniciativas. Nas adaptações ao setor público, a perspectiva do cidadão ou da sociedade costuma ocupar posição superior, pois expressa a finalidade pública.',
    foundation: 'Balanced Scorecard — tradução da estratégia e adaptação das perspectivas ao setor público.',
    trap: 'Aplicar mecanicamente ao setor público a hierarquia financeira típica do setor privado.',
  }],
  [120, {
    textBase: groups.estrategia,
    prompt: 'A avaliação de resultados estratégicos enfatiza a verificação da eficácia das ações implementadas, permitindo o realinhamento de objetivos para otimizar o atendimento às demandas sociais e a eficiência alocativa.',
    assunto: 'Planejamento e gestão estratégica', subassunto: 'Avaliação de resultados estratégicos',
    comment: 'O item está certo. A avaliação estratégica compara resultados e objetivos, verifica a eficácia das ações e fornece evidências para corrigir rumos, realocar recursos e melhorar o atendimento das demandas sociais.',
    foundation: 'Gestão estratégica — avaliação de resultados, aprendizagem e realinhamento.',
    trap: 'Tratar avaliação como etapa meramente formal, sem revisão de objetivos ou recursos.',
  }],
]);

if (official.size !== 38) throw new Error(`Matriz oficial incompleta: ${official.size}/38.`);
for (let number = 83; number <= 120; number += 1) {
  if (!official.has(number)) throw new Error(`Item ${number} ausente da matriz oficial.`);
}

async function request(endpoint, options = {}, attempt = 1) {
  const response = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.status === 204 ? {} : response.json();
  const body = await response.text();
  if ((response.status === 429 || response.status >= 500) && attempt < 9) {
    await sleep(Math.max(Number(response.headers.get('retry-after') || 0) * 1000, 500 * 2 ** (attempt - 1)));
    return request(endpoint, options, attempt + 1);
  }
  throw new Error(`Notion API ${response.status}: ${body.slice(0, 700)}`);
}

function value(property) {
  if (!property) return null;
  if (property.type === 'title') return richText(property.title);
  if (property.type === 'rich_text') return richText(property.rich_text);
  if (property.type === 'select') return property.select?.name ?? null;
  if (property.type === 'status') return property.status?.name ?? null;
  if (property.type === 'checkbox') return Boolean(property.checkbox);
  if (property.type === 'number') return property.number;
  if (property.type === 'date') return property.date?.start ?? null;
  if (property.type === 'url') return property.url ?? null;
  if (property.type === 'formula') {
    if (property.formula?.type === 'boolean') return property.formula.boolean;
    if (property.formula?.type === 'string') return property.formula.string;
    if (property.formula?.type === 'number') return property.formula.number;
  }
  return null;
}

async function readAll() {
  const rows = [];
  let cursor;
  do {
    const body = {page_size: 100};
    if (cursor) body.start_cursor = cursor;
    const page = await request(`/data_sources/${SOURCE}/query`, {
      method: 'POST', body: JSON.stringify(body),
    });
    for (const item of page.results || []) {
      rows.push({
        notion_id: item.id,
        notion_url: item.url,
        property_types: Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, property.type])),
        ...Object.fromEntries(Object.entries(item.properties || {}).map(([name, property]) => [name, value(property)])),
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

function chunks(text, max = 1900) {
  const source = clean(text);
  if (!source) return [];
  const result = [];
  for (let index = 0; index < source.length; index += max) result.push(source.slice(index, index + max));
  return result;
}

function richProperty(text) {
  return {rich_text: chunks(text).map(content => ({type: 'text', text: {content}}))};
}

function stripStaleTrace(text) {
  const source = clean(text);
  const marker = source.search(/\s*RASTREABILIDADE PENDENTE:/i);
  return marker >= 0 ? source.slice(0, marker).trim() : source;
}

async function readPublicCodes() {
  const response = await fetch(new URL('data/release/catalogo.json', PUBLIC_BASE), {headers: {'cache-control': 'no-cache'}});
  if (!response.ok) throw new Error(`Catálogo público indisponível: HTTP ${response.status}.`);
  const catalog = await response.json();
  const codes = new Set();
  for (const metadata of catalog.materials || []) {
    const file = String(metadata.file || '').replace(/^\.\//, '');
    const materialResponse = await fetch(new URL(file, PUBLIC_BASE), {headers: {'cache-control': 'no-cache'}});
    if (!materialResponse.ok) throw new Error(`${metadata.id}: material público indisponível, HTTP ${materialResponse.status}.`);
    const material = await materialResponse.json();
    for (const question of material.questoes || []) {
      if (question.codigo) codes.add(clean(question.codigo));
      if (question.codigo_fonte) codes.add(clean(question.codigo_fonte));
    }
  }
  return {catalog, codes};
}

function failList(label, values) {
  if (values.length) throw new Error(`${label}: ${values.join(', ')}`);
}

const allRows = await readAll();
const rows = allRows
  .filter(row => clean(row['Nome do material']) === MATERIAL && row['Duplicada'] !== true)
  .sort((a, b) => Number(a['Número original']) - Number(b['Número original']));

if (rows.length !== 120) throw new Error(`Material incompleto: ${rows.length}/120 registros canônicos.`);
for (let index = 0; index < rows.length; index += 1) {
  const number = index + 1;
  if (Number(rows[index]['Número original']) !== number) throw new Error(`Numeração divergente na posição ${number}.`);
  if (clean(rows[index]['Código']) !== codeFor(number)) throw new Error(`Código divergente no item ${number}: ${rows[index]['Código']}.`);
}

failList('Transcrição não conferida antes do saneamento', rows.filter(row => row['Transcrição conferida'] !== true).map(row => row['Código']));
failList('Gabarito não marcado como conferido', rows.filter(row => row['Gabarito conferido — registro manual anterior'] !== true).map(row => row['Código']));
failList('Duplicidade indevida', rows.filter(row => row['Duplicada'] === true).map(row => row['Código']));
failList('Anulação inesperada', rows.filter(row => row['Anulada'] === true).map(row => row['Código']));
failList('Imagem inesperada', rows.filter(row => row['Possui imagem'] === true).map(row => row['Código']));

const blockedEarly = rows.slice(0, 8).filter(row => row['Bloqueio manual de publicação'] === true).map(row => Number(row['Número original']));
if (JSON.stringify(blockedEarly) !== JSON.stringify([4, 8])) throw new Error(`Bloqueios dos itens 1–8 divergentes: ${blockedEarly.join(', ') || 'nenhum'}.`);
failList('Itens 1–8 com recibo indevido', rows.slice(0, 8).filter(row => clean(row['Código GitHub']) || clean(row['Data da publicação']) || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));

const published = rows.slice(8);
if (published.length !== 112) throw new Error(`Recorte publicado divergente: ${published.length}/112.`);
failList('Itens 9–120 sem Código GitHub', published.filter(row => !clean(row['Código GitHub'])).map(row => row['Código']));
failList('Código GitHub divergente', published.filter(row => clean(row['Código GitHub']) !== clean(row['Código'])).map(row => row['Código']));
failList('Itens 9–120 ainda liberados para nova exportação', published.filter(row => row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));

failList('Gabarito divergente fora da faixa materialmente incorreta', rows.slice(0, 82).filter((row, index) => clean(row['Gabarito']) !== expectedAnswers[index]).map(row => `${row['Número original']}=${row['Gabarito']}`));

const {catalog, codes: publicCodes} = await readPublicCodes();
failList('Itens 9–120 ausentes do site público', published.filter(row => !publicCodes.has(clean(row['Código']))).map(row => row['Código']));
failList('Itens 1–8 presentes indevidamente no site público', rows.slice(0, 8).filter(row => publicCodes.has(clean(row['Código']))).map(row => row['Código']));

const before = rows.map(row => ({
  numero: Number(row['Número original']), code: row['Código'], notion_id: row.notion_id, notion_url: row.notion_url,
  texto_base: row['Texto-base'], enunciado: row['Enunciado'], gabarito: row['Gabarito'], comentario: row['Comentário geral'],
  fundamento: row['Fundamento legal'], pegadinha: row['Pegadinha'], observacoes: row['Observações'], assunto: row['Assunto'],
  subassunto: row['Subassunto'], auditoria: row['Auditoria de conteúdo'], status_manual: row['Status editorial — registro manual anterior'],
  bloqueio: row['Bloqueio manual de publicação'], liberada: row['Liberada para exportação'], lote: row['Lote de publicação'],
  codigo_github: row['Código GitHub'], data_publicacao: row['Data da publicação'], data_revisao: row['Data da revisão'],
}));

let receiptsUpdated = 0;
let contentCorrected = 0;
for (const row of rows.slice(8, 82)) {
  const patch = {};
  if (clean(row['Data da publicação']) !== PUBLICATION_DATE) patch['Data da publicação'] = {date: {start: PUBLICATION_DATE}};
  if (clean(row['Status editorial — registro manual anterior']) !== 'Publicada') patch['Status editorial — registro manual anterior'] = {select: {name: 'Publicada'}};
  const cleanedObservations = stripStaleTrace(row['Observações']);
  if (cleanedObservations !== clean(row['Observações'])) patch['Observações'] = richProperty(cleanedObservations);
  if (!Object.keys(patch).length) continue;
  await request(`/pages/${row.notion_id}`, {method: 'PATCH', body: JSON.stringify({properties: patch})});
  receiptsUpdated += 1;
  if (receiptsUpdated % 20 === 0) console.log(`${receiptsUpdated}/74 recibos válidos reconciliados.`);
}

for (let number = 83; number <= 120; number += 1) {
  const row = rows[number - 1];
  const item = official.get(number);
  const page = number <= 96 ? '6' : number <= 114 ? '7' : '8';
  const auditNote = `SANEAMENTO EDITORIAL — 31/07/2026: o conteúdo anterior deste registro não correspondia ao item ${number} da prova aplicada para Administrador (código 400). Enunciado, comando, gabarito definitivo, classificação, comentário e fundamento foram reconciliados com a prova oficial e o gabarito definitivo publicados pela banca. Código GitHub e histórico de publicação preservados. Registro bloqueado para impedir nova exportação até resincronização controlada do site.`;
  const patch = {
    'Texto-base': richProperty(item.textBase),
    'Enunciado': richProperty(item.prompt),
    'Gabarito': {select: {name: expectedAnswers[number - 1]}},
    'Comentário geral': richProperty(item.comment),
    'Fundamento legal': richProperty(item.foundation),
    'Pegadinha': richProperty(item.trap),
    'Assunto': richProperty(item.assunto),
    'Subassunto': richProperty(item.subassunto),
    'Página do PDF': richProperty(page),
    'Bloco': {select: {name: 'Conhecimentos Específicos'}},
    'Disciplina': richProperty('Administração'),
    'Auditoria de conteúdo': {select: {name: 'Ajustada'}},
    'Bloqueio manual de publicação': {checkbox: true},
    'Status editorial — registro manual anterior': {select: {name: 'Bloqueada'}},
    'Liberada para exportação': {checkbox: false},
    'Lote de publicação': {rich_text: []},
    'Transcrição conferida': {checkbox: true},
    'Gabarito conferido — registro manual anterior': {checkbox: true},
    'Data da revisão': {date: {start: REVIEW_DATE}},
    'Data da publicação': {date: {start: PUBLICATION_DATE}},
    'Observações': richProperty(auditNote),
  };
  await request(`/pages/${row.notion_id}`, {method: 'PATCH', body: JSON.stringify({properties: patch})});
  contentCorrected += 1;
  if (contentCorrected % 10 === 0) console.log(`${contentCorrected}/38 registros materialmente corrigidos e bloqueados.`);
}

await sleep(6000);
const verified = (await readAll())
  .filter(row => clean(row['Nome do material']) === MATERIAL && row['Duplicada'] !== true)
  .sort((a, b) => Number(a['Número original']) - Number(b['Número original']));
if (verified.length !== 120) throw new Error(`Pós-validação: ${verified.length}/120 registros.`);

failList('Itens 1–8 alterados indevidamente', verified.slice(0, 8).filter(row => clean(row['Código GitHub']) || clean(row['Data da publicação']) || row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));
failList('Gabarito definitivo ainda divergente', verified.filter((row, index) => clean(row['Gabarito']) !== expectedAnswers[index]).map(row => `${row['Número original']}=${row['Gabarito']}`));
failList('Recibo 9–82 ainda incompleto', verified.slice(8, 82).filter(row => clean(row['Data da publicação']) !== PUBLICATION_DATE || clean(row['Status editorial — registro manual anterior']) !== 'Publicada').map(row => row['Código']));

const corrected = verified.slice(82);
failList('Enunciado oficial ainda divergente', corrected.filter(row => clean(row['Enunciado']) !== official.get(Number(row['Número original'])).prompt).map(row => row['Código']));
failList('Texto-base oficial ainda divergente', corrected.filter(row => clean(row['Texto-base']) !== official.get(Number(row['Número original'])).textBase).map(row => row['Código']));
failList('Faixa 83–120 sem bloqueio', corrected.filter(row => row['Bloqueio manual de publicação'] !== true).map(row => row['Código']));
failList('Faixa 83–120 com auditoria/status divergente', corrected.filter(row => clean(row['Auditoria de conteúdo']) !== 'Ajustada' || clean(row['Status editorial — registro manual anterior']) !== 'Bloqueada').map(row => row['Código']));
failList('Faixa 83–120 liberada ou loteada', corrected.filter(row => row['Liberada para exportação'] === true || clean(row['Lote de publicação'])).map(row => row['Código']));
failList('Faixa 83–120 sem rastreabilidade histórica', corrected.filter(row => clean(row['Código GitHub']) !== clean(row['Código']) || clean(row['Data da publicação']) !== PUBLICATION_DATE).map(row => row['Código']));
failList('Faixa 83–120 sem nota de saneamento', corrected.filter(row => !/SANEAMENTO EDITORIAL — 31\/07\/2026/.test(clean(row['Observações']))).map(row => row['Código']));

const after = verified.map(row => ({
  numero: Number(row['Número original']), code: row['Código'], notion_id: row.notion_id, notion_url: row.notion_url,
  texto_base: row['Texto-base'], enunciado: row['Enunciado'], gabarito: row['Gabarito'], comentario: row['Comentário geral'],
  fundamento: row['Fundamento legal'], pegadinha: row['Pegadinha'], observacoes: row['Observações'], assunto: row['Assunto'],
  subassunto: row['Subassunto'], auditoria: row['Auditoria de conteúdo'], status_manual: row['Status editorial — registro manual anterior'],
  bloqueio: row['Bloqueio manual de publicação'], liberada: row['Liberada para exportação'], lote: row['Lote de publicação'],
  codigo_github: row['Código GitHub'], data_publicacao: row['Data da publicação'], data_revisao: row['Data da revisão'],
}));

const report = {
  generated_at: new Date().toISOString(),
  material: MATERIAL,
  source: {
    prova: '400_Administrador_QUADRIX_concurso_2025_CRF-DF.pdf',
    gabarito: 'CRF-DF_concurso_publico_2025_gabarito_definitivo_prova_objetiva.pdf',
    applied_at: '2026-03-15', definitive_key_published_at: '2026-04-06',
  },
  public_catalog: {release_version: catalog.release_version ?? null, questions: catalog.summary?.questoes ?? null, materials: catalog.summary?.materiais ?? null},
  operation: {
    total_material: 120,
    untouched_unpublished: [1,2,3,4,5,6,7,8],
    original_blocks_preserved: [4,8],
    valid_publication_receipts_reconciled: 74,
    corrected_and_blocked: 38,
    corrected_range: '83–120',
    publication_date_reconciled: PUBLICATION_DATE,
    new_releases: 0, new_lots: 0, github_changes_to_main: 0, site_changes: 0,
  },
  before,
  after,
};
fs.mkdirSync('artifacts', {recursive: true});
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

console.log('SANEAMENTO_RESULT=' + JSON.stringify(report.operation));
console.log(`SANEAMENTO_REPORT=${REPORT_PATH}`);
