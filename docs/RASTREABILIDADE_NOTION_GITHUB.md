# Rastreabilidade Notion → GitHub Pages

A publicação é considerada concluída somente após estas etapas:

1. o registro passa pelo gate editorial do Banco Mestre;
2. o snapshot preserva o `notion_id`, o `Código` editorial e o lote de publicação;
3. o build grava a questão em um arquivo público de material, mantendo `codigo` e `codigo_fonte`;
4. a auditoria pública confirma os códigos nos arquivos de materiais e testa a plataforma no Chromium;
5. `mark-notion-published.mjs` preenche `Código GitHub` e `Data da publicação` no Notion com o commit efetivamente publicado.

O `catalogo.json` é um índice resumido e não deve ser usado isoladamente para verificar códigos editoriais. A reconciliação deve ler os arquivos apontados por `catalog.materials[].file`.
