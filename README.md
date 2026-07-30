# SEDES/DF Questões

Plataforma independente e compartilhada para preparação para o concurso da Secretaria de Desenvolvimento Social do Distrito Federal.

## Situação do acervo

- **870 questões** cadastradas no Banco Mestre do Notion;
- **570 questões consolidadas** no caderno editorial `CONSOL01` e integradas à release 2.3;
- **300 inserções recentes** mantidas fora do site até conclusão da auditoria estrutural e editorial;
- **35 simulados completos** no catálogo consolidado;
- nenhuma questão autoral é apresentada como questão oficial da Quadrix.

As 570 questões desta release correspondem ao acervo consolidado originalmente preparado para **TDAS — Técnico Administrativo**. Os perfis de nível superior têm acesso livre a todo o acervo, mas materiais específicos de Administração, Direito e Legislação e Educador Social somente serão identificados como tais quando forem individualmente classificados e validados para esses cargos.

## Perfis locais

- **Rodrigo:** Técnico Administrativo e Administração;
- **Amanda:** Técnico Administrativo e Direito e Legislação;
- **Andressa:** Agente Social e Educador Social.

Cada perfil possui, de forma independente neste navegador:

- histórico de tentativas;
- caderno de erros;
- questões marcadas;
- progresso e precisão;
- tentativa salva para continuar depois;
- cargos prioritários;
- backup exportável e importável.

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

Dashboard com perfil ativo, contador da prova, situação editorial do banco, próxima ação, métricas e materiais em destaque.

### Estudar

- filtro principal por nível e matéria;
- filtros avançados por cargo e tipo de material;
- seleção de 10, 20, 30 ou 50 questões;
- somente inéditas, erradas ou marcadas;
- modo treino ou modo prova;
- progresso por material calculado apenas com questões efetivamente respondidas.

### Revisar

- caderno de erros formado somente por respostas erradas;
- erros recorrentes;
- questões marcadas;
- revisão das dez questões mais críticas;
- revisão por material.

### Desempenho

- precisão entre questões respondidas;
- cobertura real do acervo, sem contar itens em branco;
- tempo acumulado;
- estatísticas por matéria;
- assuntos com menor precisão;
- histórico de tentativas;
- exportação, importação e limpeza dos dados locais.

## Resolução de questões

A plataforma mantém:

- correção imediata no modo treino;
- correção ao final no modo prova;
- cronômetro total e por questão;
- mapa acessível de navegação;
- marcação para revisão;
- comentários, fundamentos e pegadinhas;
- confirmação antes de finalizar com questões em branco;
- sessão compacta baseada em IDs;
- salvamento ao sair, ocultar ou suspender a página;
- proteção contra substituição silenciosa de uma tentativa salva;
- correção detalhada com texto-base, alternativas, resposta marcada, gabarito e tempo.

## Migração de progresso

A release 2.3 executa uma migração única nos históricos locais de Rodrigo, Amanda e Andressa. Ela:

- preserva tentativas, notas, tempos, erros reais e questões marcadas;
- separa questões apresentadas de questões efetivamente respondidas;
- corrige cobertura, progresso e filtro de inéditas;
- remove do caderno de erros registros antigos gerados apenas por itens em branco quando existe evidência suficiente no histórico.

## Arquitetura da release 2.3

```text
Fontes e provas
      ↓
Banco Mestre no Notion — 870 registros
      ↓
Auditoria e consolidação — CONSOL01
      ↓
GitHub Actions gera a release estática
      ├── catálogo final
      ├── manifesto com hashes
      └── 35 arquivos independentes de materiais
      ↓
GitHub Pages
```

A base anterior de 180 questões e a atualização incremental permanecem preservadas como fontes históricas. O navegador não remonta, descompacta ou recomprime mais o banco. Ele carrega o catálogo final e baixa apenas os materiais necessários.

## Validação

```bash
npm run check
```

O pipeline:

1. reconstrói e valida a base histórica;
2. aplica as correções incrementais;
3. converte os 26 blocos consolidados;
4. gera os 35 arquivos finais;
5. exige exatamente 570 questões e 35 materiais;
6. verifica IDs, códigos, alternativas, gabaritos e comentários;
7. cria e confere hashes de cada arquivo;
8. valida o índice de 570 questões;
9. verifica os cinco cargos, os dois níveis e a data da prova;
10. verifica sessões compactas, migração do progresso, backup e recursos de acessibilidade.

## Publicação

Pull requests executam todo o build e os testes sem alterar o site. Somente a branch `main`, após validação bem-sucedida, pode gerar e publicar o GitHub Pages. Se qualquer validação falhar, o deploy é interrompido e a versão pública anterior permanece disponível.
