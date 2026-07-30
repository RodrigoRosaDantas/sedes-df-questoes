# SEDES/DF Questões

Plataforma independente e compartilhada para preparação para o concurso da Secretaria de Desenvolvimento Social do Distrito Federal.

## Situação do acervo

- **870 questões** cadastradas no Banco Mestre do Notion;
- **570 questões consolidadas** no caderno editorial `CONSOL01` e integradas à release 2.2;
- **300 inserções recentes** mantidas fora do site até conclusão da auditoria estrutural e editorial;
- **35 simulados completos** no catálogo consolidado;
- nenhuma questão autoral é apresentada como questão oficial da Quadrix.

As 570 questões desta release correspondem ao acervo consolidado originalmente preparado para **TDAS — Técnico Administrativo**. Os perfis de nível superior têm acesso livre a todo o acervo, mas materiais específicos de Administração, Direito e Legislação e Educador Social somente serão identificados como tais quando forem individualmente classificados e validados para esses cargos.

## Perfis locais

A plataforma inclui três perfis:

- **Rodrigo:** Técnico Administrativo e Administração;
- **Amanda:** Técnico Administrativo e Direito e Legislação;
- **Andressa:** Agente Social e Educador Social.

Cada perfil possui, de forma independente neste navegador:

- histórico de tentativas;
- caderno de erros;
- questões marcadas;
- progresso e aproveitamento;
- tentativa salva para continuar depois;
- cargos prioritários.

O perfil organiza histórico e recomendações, mas **não restringe o acesso**. Todos podem abrir todos os materiais, níveis, provas e simulados publicados. Os dados não são enviados a um servidor e não aparecem automaticamente em outro aparelho.

## Cargos acompanhados

### Nível médio

- TDAS 200 — Agente Social;
- TDAS 202 — Técnico Administrativo.

### Nível superior

- EDAS 400 — Administração;
- EDAS 403 — Direito e Legislação;
- EDAS 405 — Educador Social.

## Áreas da plataforma

### Início

Dashboard compacto com perfil ativo, contador da prova, situação do banco, próxima ação, estatísticas e materiais em destaque.

### Estudar

- catálogo de simulados e provas;
- treino personalizado;
- filtro principal por nível e matéria;
- filtros avançados por cargo e tipo de material;
- seleção de 10, 20, 30 ou 50 questões;
- somente inéditas, erradas ou marcadas;
- modo treino ou modo prova;
- progresso e melhor resultado por material.

### Revisar

- caderno de erros;
- erros recorrentes;
- questões marcadas;
- revisão das dez questões mais críticas;
- revisão por material.

### Desempenho

- aproveitamento geral;
- cobertura do acervo publicado;
- tempo acumulado;
- estatísticas por disciplina;
- histórico de tentativas.

## Resolução de questões

A plataforma mantém:

- correção imediata no modo treino;
- correção ao final no modo prova;
- cronômetro total e por questão;
- mapa de navegação;
- marcação para revisão;
- comentários, fundamentos e pegadinhas;
- confirmação antes de finalizar com questões em branco;
- opção de salvar e continuar a tentativa depois.

## Arquitetura editorial

```text
Fontes e provas
      ↓
Banco Mestre no Notion — 870 registros
      ↓
Auditoria e consolidação — CONSOL01
      ↓
570 questões liberadas · 300 em quarentena editorial
      ↓
Catálogo e pacote versionados
      ↓
GitHub Pages
```

A base anterior de 180 questões e a atualização incremental permanecem preservadas. A release 2.2 substitui três materiais parciais de Português pelas versões completas e acrescenta 26 blocos consolidados, fechando **570 questões em 35 materiais**.

## Validação

```bash
npm run check
```

O pipeline verifica:

- integridade dos fragmentos do pacote-base;
- aplicação da atualização incremental;
- existência dos 26 arquivos consolidados;
- contagem exata de 390 questões adicionais;
- fechamento final em 570 questões e 35 materiais;
- substituição dos três materiais parciais;
- ausência de códigos duplicados;
- enunciado, alternativas A–E, gabarito e comentário;
- data da prova e cinco cargos oficiais;
- três perfis e quatro áreas principais;
- isolamento de dados por perfil;
- retomada de sessão;
- sintaxe dos arquivos JavaScript.

## Publicação

O workflow em `.github/workflows/pages.yml` executa `npm run check` e publica automaticamente a branch `main` no GitHub Pages. Se qualquer validação falhar, o deploy é interrompido e a versão pública anterior permanece disponível.
