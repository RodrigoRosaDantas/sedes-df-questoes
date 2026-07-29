# SEDES/DF Questões

Plataforma independente e compartilhada para preparação para o concurso da Secretaria de Desenvolvimento Social do Distrito Federal.

## Situação do acervo

- **570 questões** cadastradas e estruturalmente completas no Banco Mestre do Notion;
- **183 questões** disponíveis atualmente no site;
- **387 questões** aguardando exportação integral;
- **12 materiais publicados**, sendo 9 simulados completos e 3 materiais parciais;
- nenhuma questão oficial é apresentada como sendo da Quadrix quando sua origem é autoral.

A diferença entre Banco Mestre e site é mostrada de forma explícita na página inicial. A exportação integral foi interrompida pelo limite temporário de consultas do conector do Notion; o pacote de 183 questões foi preservado para não retirar conteúdo já utilizável.

## Perfis locais

A versão 2.0 inclui três perfis:

- Rodrigo;
- Amanda;
- Andressa.

Cada perfil possui, de forma independente neste navegador:

- histórico de tentativas;
- caderno de erros;
- questões marcadas;
- progresso e aproveitamento;
- tentativa salva para continuar depois;
- seleção dos cargos acompanhados.

O histórico da versão anterior é migrado para o perfil Rodrigo. Os dados não são enviados a um servidor e não aparecem automaticamente em outro aparelho.

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
- filtros por cargo e disciplina;
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
Banco Mestre no Notion
      ↓
Validação editorial
      ↓
Catálogo e pacote versionados
      ↓
GitHub Pages
```

A base v1.0 com 180 questões permanece preservada. Uma camada incremental aplica três correções e acrescenta três questões, resultando nas 183 atualmente publicadas.

## Validação

```bash
npm run check
```

O pipeline verifica:

- integridade dos 12 fragmentos do pacote-base;
- aplicação incremental;
- 570 questões declaradas no Banco Mestre e 183 publicadas;
- IDs, códigos, alternativas e gabaritos;
- data da prova e cinco cargos oficiais;
- três perfis e quatro áreas principais;
- isolamento de dados por perfil;
- retomada de sessão;
- sintaxe dos arquivos JavaScript.

## Publicação

O workflow em `.github/workflows/pages.yml` executa `npm run check` e publica automaticamente a branch `main` no GitHub Pages.
