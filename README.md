# SEDES/DF Questões

Plataforma independente para resolução de provas e simulados destinados à preparação para concursos da Secretaria de Desenvolvimento Social do Distrito Federal.

## Publicação atual

- **183 questões publicadas**;
- **12 materiais disponíveis**;
- **9 simulados completos**, com 20 questões cada;
- **3 materiais de Português em publicação parcial**, com uma questão ajustada cada;
- cargo inicial: **TDAS — Técnico Administrativo — código 202**;
- fonte editorial: **Banco Mestre — Provas e Simulados SEDES/DF**, no Notion;
- autoria dos simulados publicados: **Emília Adelino**.

### Materiais disponíveis

1. PROG01 — Programas e Benefícios do DF;
2. PROG02 — Programas e Benefícios do DF;
3. PROG03 — Programas e Benefícios do DF;
4. PROG04 — Programas e Benefícios do DF;
5. PROG05 — SISAN e Restaurantes Comunitários;
6. CONST01 — Direito Constitucional;
7. ADM01 — Direito Administrativo;
8. ARQ01 — Arquivologia;
9. MAT01 — Recursos Materiais e Patrimônio;
10. PT03 — Ortografia oficial — publicação parcial;
11. PT05 — Tempos e modos verbais — publicação parcial;
12. PT15 — Reescrita de frases e parágrafos — publicação parcial.

## Funcionalidades

- catálogo com separação entre **Provas anteriores** e **Simulados**;
- busca e filtro por disciplina;
- modo treino com correção imediata;
- modo prova com correção apenas ao final;
- treino aleatório entre os materiais;
- cronômetro total e por questão;
- mapa de navegação e marcação para revisão;
- resultado detalhado, comentários, fundamentos e pegadinhas;
- histórico de tentativas salvo localmente;
- caderno de erros por material;
- refação de questões erradas e em branco;
- contador regressivo para a prova da SEDES/DF;
- tema claro/escuro e interface responsiva.

## Arquitetura editorial

```text
Fontes e provas
      ↓
Banco Mestre no Notion
      ↓
Critérios de publicação e validação
      ↓
Catálogo JSON versionado
      ↓
GitHub Pages
```

A base v1.0 com 180 questões permanece imutável. A atualização manual de 29/07/2026 acrescenta três questões de Português e substitui três itens ajustados, sem alterar rotinas programadas, o contador da prova ou o pacote-base.

## Estrutura de dados

```text
data/
├── catalogo.json
├── bundle/
│   ├── part-01.txt
│   ├── ...
│   └── part-12.txt
└── updates/
    └── update-2026-07-29.json
```

O pacote-base está compactado com gzip, codificado em Base64 e dividido em 12 fragmentos com integridade verificável. A camada incremental é aplicada somente durante o carregamento e mantém o histórico da base preservado.

## Validação

```bash
npm run check
```

Os validadores verificam:

- base imutável com nove materiais e 180 questões;
- aplicação incremental com três correções e três novos itens;
- resultado final com 12 materiais e 183 questões;
- IDs e códigos duplicados;
- enunciados e comentários;
- alternativas A–E;
- gabaritos válidos;
- configuração e contador da prova;
- sintaxe dos arquivos JavaScript.

## Publicação

O workflow em `.github/workflows/pages.yml` executa `npm run check` e publica automaticamente a branch `main` no GitHub Pages.
