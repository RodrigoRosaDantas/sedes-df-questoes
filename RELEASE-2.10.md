# Release 2.10 — evolução mensurável

## Relatórios por perfil

- períodos de 7 dias, 30 dias e histórico completo;
- volume de respostas, precisão, tempo, tentativas e questões únicas;
- comparação automática com o período anterior de igual duração;
- gráfico diário de consistência;
- desempenho por matéria;
- distribuição dos motivos de erro;
- leitura automática do momento de estudo;
- exportação do relatório em CSV.

## Backup completo

O novo backup inclui:

- histórico;
- caderno de erros;
- questões marcadas;
- tentativa salva;
- anotações pessoais;
- motivos dos erros;
- agenda D0/D7/D20;
- controle das tentativas já processadas pela revisão.

A restauração completa é separada da importação legada para evitar perda silenciosa dos dados inteligentes.

## Produção

- `dist/` validado dinamicamente, sem totais fixos;
- quantidade declarada comparada ao índice e aos arquivos reais;
- `build-info.json` com versão, data, commit e totais;
- service worker renovado para a versão 2.10;
- validação impede publicação sem relatórios, backup ou proveniência.

Os 690 itens e os 36 materiais permanecem inalterados nesta entrega.
