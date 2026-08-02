# Restauração do Banco Mestre — 02/08/2026

Operação excepcional e de uso único para restaurar os 2.458 registros movidos à lixeira.

## Fonte dos IDs

Página de backup do Notion: `3b0cf5a2-6731-8199-bc70-e7eec7020747`.

## Travas

- estado inicial obrigatório: 2.536 registros ativos;
- exatamente 2.458 IDs únicos extraídos dos blocos de código do backup;
- SHA-256 obrigatório: `2b4ed19bf9a029a31f5b64fb2d1869e81a368decf1425d6c1cd73c5f50deeaf2`;
- estado final obrigatório: 4.994 registros ativos;
- execução permitida somente em `push` para `main`;
- pull requests não modificam o Notion.

Após a confirmação da restauração, este arquivo, a solicitação e o restaurador devem ser removidos em uma alteração de encerramento.
