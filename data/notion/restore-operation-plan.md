# Plano de restauração integral

1. Validar que o Banco Mestre possui exatamente 2.536 registros ativos.
2. Ler os IDs exclusivamente dos blocos de código da página de backup do Notion.
3. Exigir exatamente 2.458 IDs únicos e o hash SHA-256 registrado na operação original.
4. Restaurar as páginas individualmente com retry e limitação de taxa.
5. Recontar o Banco Mestre e exigir exatamente 4.994 registros ativos.
6. Registrar o resultado na própria página de backup.
7. Remover, em alteração subsequente, o restaurador e os arquivos de autorização temporários.

A validação em pull request não modifica o Notion. A execução é permitida somente após integração na branch `main`.
