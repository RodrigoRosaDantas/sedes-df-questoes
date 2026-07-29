# SEDES/DF Questões

Plataforma independente para resolução de provas e simulados destinados à preparação para concursos da Secretaria de Desenvolvimento Social do Distrito Federal.

## Publicação atual

- **180 questões validadas**;
- **9 simulados completos**, com 20 questões cada;
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
9. MAT01 — Recursos Materiais e Patrimônio.

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

Somente questões com transcrição conferida, gabarito conferido e sem marcação de duplicidade foram incluídas nesta publicação.

## Estrutura de dados

```text
data/
├── catalogo.json
└── bundle/
    ├── part-01.txt
    ├── ...
    └── part-12.txt
```

O catálogo inicial é leve. O banco completo está compactado com gzip, codificado em Base64 e dividido em 12 fragmentos com integridade verificável. Os fragmentos são reunidos apenas quando o usuário abre um material e permanecem em cache durante a sessão.

## Validação

```bash
npm test
```

O validador reúne os 12 fragmentos, descompacta o banco e verifica:

- nove materiais e 180 questões;
- IDs e códigos duplicados;
- enunciados e comentários;
- alternativas A–E;
- gabaritos válidos;
- quantidades por material e total geral.

## Publicação

O workflow em `.github/workflows/pages.yml` executa a validação e publica automaticamente a branch `main` no GitHub Pages.
