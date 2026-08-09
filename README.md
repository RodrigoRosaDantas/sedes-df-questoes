# SEDES/DF Questões

Plataforma estática e local-first para preparação do concurso SEDES/DF, publicada no GitHub Pages a partir da arquitetura:

```text
Notion → snapshot e plano explícito → GitHub Actions → GitHub Pages
```

## Fonte única da release

Os números atuais do acervo, a versão da aplicação, o commit publicado, a versão do cache e os hashes das fontes canônicas são gerados automaticamente em:

```text
data/release/release-meta.json
```

O aplicativo, o verificador público e os testes de build usam esse arquivo. Este README não mantém totais manuais como fonte de verdade, evitando divergências após novas publicações.

## Recursos principais

- perfis locais independentes;
- estudo por matéria, tópico, prova ou simulado;
- modos treino e prova;
- questões de múltipla escolha e Certo/Errado;
- cronômetro total e por questão;
- tentativa salva e recuperável;
- caderno de erros e questões marcadas;
- revisão D0/D7/D20 e revisão adaptativa;
- desempenho por matéria e assunto;
- exportação, importação e limpeza do progresso;
- download de provas e simulados em PDF para responder ou comentado;
- PWA com funcionamento offline controlado;
- reporte estruturado de problema por questão.

## Prova Real SEDES/DF 2026

A plataforma monta uma simulação baseada no Edital nº 1/2026:

- 60 questões objetivas;
- 20 questões de conhecimentos gerais, peso 1;
- 40 questões de conhecimentos específicos, peso 2;
- 100 pontos na objetiva;
- mínimos de 10 pontos em conhecimentos gerais e 40 pontos em conhecimentos específicos;
- janela oficial de 4 horas compartilhada entre as provas objetiva e discursiva.

A nota discursiva não é calculada nesse modo.

## Segurança do progresso

Os dados continuam armazenados no navegador, sem envio automático a servidor. A versão 2.13 acrescenta pontos de restauração automáticos e manuais, restauração com cópia do estado anterior, diagnóstico de armazenamento e backup protegido por senha com PBKDF2 e AES-GCM.

A sincronização automática entre aparelhos não é ativada porque o GitHub Pages não oferece autenticação ou armazenamento privado. Essa opção exigirá um serviço de backend separado e auditado.

## Qualidade editorial

O botão **Reportar problema nesta questão** abre uma issue pré-preenchida no repositório, contendo código da questão, material, release, commit e ambiente. O relato não altera automaticamente o Notion nem o pacote público.

## Validação

```bash
npm run check
```

Esse comando funciona em clone limpo e sem credenciais. Ele congela por hash todos os arquivos versionados da release, gera somente os índices derivados e o `dist`, valida sintaxe, catálogo, materiais, downloads, relevância dos editais, formatos, PWA, acessibilidade, navegação, prova real, discursivas, metadados e governança. Ao final, comprova que a fonte canônica permaneceu byte a byte inalterada.

O pipeline editorial completo continua disponível em `npm run check:release`, mas deve ser usado somente depois que uma operação autorizada gerar os arquivos transitórios de exportação do Notion. Ele não é o comando padrão de auditoria de um clone limpo.

## Governança de publicação

- pull requests executam apenas a validação de leitura, com permissão `contents: read`;
- o GitHub Pages só publica por acionamento manual, com o SHA exato da `main` e confirmação `PUBLICAR`;
- a suíte pública completa roda contra o artefato local antes do deploy e novamente no endereço público depois dele;
- sincronização, escrita e fechamento de rastreabilidade no Notion permanecem suspensos sem autorização operacional específica;
- o recibo cumulativo do último deploy é registrado separadamente e distingue o commit da interface do recibo editorial que formou o acervo.

Pull requests nunca publicam. Somente a `main`, depois da validação e de uma autorização manual explícita, pode gerar um novo deploy do GitHub Pages.
