# Release 2.11 — build consolidado e deploy verificável

## Consolidação técnica

- remove a cadeia de scripts que alterava `index.html` e `assets/app-v4.js` durante o build;
- substitui os patches por `scripts/build-public.mjs`, um compilador determinístico que lê as fontes, gera a aplicação final diretamente em `dist/` e não modifica o repositório;
- mantém a navegação por matérias, tópicos, simulados e provas anteriores;
- mantém painel Hoje, D0/D7/D20, relatórios, anotações, Anki, PWA e backup transacional;
- renova o cache para `sedes-questoes-v2-11`.

## Verificação de produção

Após `actions/deploy-pages`, o workflow consulta o próprio endereço público e exige:

- versão 2.11.0;
- mesmo commit do workflow;
- compilador `build-public-v2-11` registrado no `build-info.json`;
- totais reais coerentes com o catálogo;
- HTML com os arquivos esperados;
- aplicação pública com validação dinâmica, matérias e provas anteriores.

O workflow falha quando o GitHub Pages continua servindo uma versão antiga ou incompleta.

## Conteúdo preservado

- 690 questões;
- 36 materiais;
- dados locais dos perfis;
- históricos, anotações, erros, revisões e sessões em andamento.

Esta entrega reduz a dívida técnica do build. A modularização interna completa do arquivo principal poderá ser feita em etapas posteriores, sem alterar o comportamento público.
