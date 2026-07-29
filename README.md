# SEDES/DF Questões

Projeto **independente** para resolução interativa de provas e simulados relacionados aos concursos da SEDES/DF.

Este repositório não pertence ao dashboard TDAS e não depende dele.

## Arquitetura

```text
Banco Mestre no Notion
→ exportação validada
→ data/questoes.json
→ site estático
→ GitHub Pages
```

## MVP incluído

- lote piloto PT01 com 10 questões;
- modo treino com correção imediata;
- modo prova com correção ao final;
- cronômetro total e por questão;
- mapa e marcação para revisão;
- resultado, comentários e refação das erradas;
- histórico local no navegador;
- tema claro/escuro e layout responsivo.

## Validação

```bash
npm test
```

## Publicação

1. Crie um repositório público chamado `sedes-df-questoes`.
2. Envie estes arquivos para a branch `main`.
3. Em **Settings → Pages**, selecione **GitHub Actions** como fonte.
4. O workflow `.github/workflows/pages.yml` validará os dados e publicará o site.

Endereço esperado:

```text
https://rodrigorosadantas.github.io/sedes-df-questoes/
```

## Regra editorial

O Notion é a fonte de verdade. Apenas questões selecionadas e tecnicamente aptas devem ser exportadas. O lote atual é um MVP de validação e permanece identificado como material em revisão.
