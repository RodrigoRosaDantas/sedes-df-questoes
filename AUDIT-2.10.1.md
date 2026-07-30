# Auditoria independente da release 2.10

## Achados confirmados

1. **Fuso horário:** agrupamento por `toISOString()` deslocava tentativas noturnas no Brasil.
2. **Visão histórica:** a opção “Tudo” somava todo o histórico, mas desenhava somente 30 dias.
3. **Motivos de erro:** o painel exibia motivos de todo o histórico dentro de relatórios de 7 ou 30 dias.
4. **Restauração parcial:** falhas de `localStorage` podiam deixar um backup parcialmente aplicado.
5. **Cobertura de testes:** o teste anterior verificava apenas o nome do arquivo de backup, sem validar conteúdo ou restauração.
6. **Proveniência ambígua:** versão da aplicação e versão editorial da base não eram distinguidas no manifesto de build.

## Tratamento

Todos os achados acima foram endereçados no hotfix 2.10.1. Nenhuma questão, material ou histórico foi alterado pelo código da release.
