# Release 2.10.1 — relatórios auditados

## Correções da auditoria

- agrupamento diário fixado no fuso `America/Sao_Paulo`;
- tentativas noturnas não migram mais para o dia seguinte por conversão UTC;
- a opção **Tudo** utiliza série mensal de todo o histórico, em vez de exibir apenas 30 dias;
- motivos dos erros respeitam o período de 7 ou 30 dias selecionado;
- CSV passa a incluir atividade do período e motivos dos erros;
- restauração de backup valida integralmente o schema antes de alterar dados;
- o diálogo informa o perfil de origem e o perfil de destino;
- a restauração é transacional e reverte o estado anterior quando qualquer gravação falha;
- downloads revogam a URL temporária somente após o navegador iniciar o arquivo.

## Testes ampliados

O Playwright agora verifica:

- agrupamento de uma tentativa realizada às 23h30 no horário de Brasília;
- diferença entre 7 dias, 30 dias e todo o histórico;
- série mensal histórica;
- filtro temporal dos motivos de erro;
- conteúdo do CSV;
- conteúdo integral do backup;
- identificação do perfil de origem;
- restauração completa;
- reversão automática após falha simulada de armazenamento;
- versão da aplicação e versão da base no `build-info.json`.

## Proveniência

A plataforma e a base possuem ciclos diferentes. O `build-info.json` passa a registrar separadamente:

- `version`: versão da aplicação;
- `data_release_version`: versão editorial do catálogo;
- `catalog_schema_version`: versão do schema dos dados;
- commit, data, quantidade de questões e materiais.

As 690 questões, os 36 materiais, os perfis e os históricos existentes permanecem inalterados.
