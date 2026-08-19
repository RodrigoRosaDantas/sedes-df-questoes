# SEDES/DF Questões

Plataforma de estudo local-first para preparação do concurso SEDES/DF, publicada no GitHub Pages a partir da arquitetura:

```text
Notion → snapshot e plano explícito → GitHub Actions → GitHub Pages
                         ↘ progresso local-first + Firebase opcional
```

## Fonte única da release

Os números atuais do acervo, a versão da aplicação, o commit publicado, a versão do cache e os hashes das fontes canônicas são gerados automaticamente em:

```text
data/release/release-meta.json
```

O aplicativo, o verificador público e os testes de build usam esse arquivo. Este README não mantém totais manuais como fonte de verdade, evitando divergências após novas publicações.

## Recursos principais

- perfis independentes;
- estudo por matéria, tópico, prova, simulado e cargo;
- modos treino e prova;
- questões de múltipla escolha e Certo/Errado;
- cronômetro total e por questão;
- tentativa salva e recuperável;
- caderno de erros e questões marcadas;
- revisão D0/D7/D20 e revisão adaptativa;
- desempenho por matéria e assunto;
- backup manual do progresso;
- reset seguro do aproveitamento, preservando marcações, anotações, preferências e sessão em andamento;
- sincronização opcional entre aparelhos com Firebase Authentication e Firestore;
- download de provas e simulados em PDF para responder ou comentado;
- PWA com funcionamento offline controlado;
- reporte interno de problema por questão;
- edital verticalizado e Prova Real para os cargos suportados.

## Prova Real SEDES/DF 2026

A plataforma monta uma simulação baseada no Edital nº 1/2026:

- 60 questões objetivas;
- 20 questões de conhecimentos gerais, peso 1;
- 40 questões de conhecimentos específicos, peso 2;
- 100 pontos na objetiva;
- mínimos de 10 pontos em conhecimentos gerais e 40 pontos em conhecimentos específicos;
- janela oficial de 4 horas compartilhada entre as provas objetiva e discursiva.

A nota discursiva não é calculada nesse modo.

## Progresso, conta e privacidade

O armazenamento local é a primeira camada: a plataforma continua utilizável sem login e mantém o progresso no navegador para suportar uso offline. Quando o usuário entra na sincronização, os dados do perfil principal são associados à conta autenticada e reconciliados com o Firestore para permitir continuidade entre aparelhos.

Os dados pessoais da plataforma ficam sob a árvore do UID autenticado. As regras do Firestore impedem leitura e escrita cruzadas entre usuários comuns e negam caminhos externos por padrão.

A sincronização não substitui o backup manual. O backup continua disponível como camada adicional de recuperação. Ações destrutivas de aproveitamento devem usar o fluxo seguro em **Configurações → Dados**, que mantém um marco de reset sincronizado para impedir que outro aparelho restaure histórico anterior.

## Qualidade editorial e relatos

O relato de problema de uma questão é armazenado internamente no progresso do perfil e pode sincronizar com a conta. O fluxo não cria automaticamente uma issue pública no GitHub e não altera sozinho o Notion nem o pacote publicado.

Conteúdo editorial, código da plataforma e publicação permanecem separados: correções técnicas não devem alterar gabaritos ou questões sem uma operação editorial específica.

## Validação

```bash
npm run check
```

Esse comando funciona em clone limpo e sem credenciais. Ele congela por hash os arquivos versionados da release, gera somente os índices derivados e o `dist`, valida sintaxe, catálogo, materiais, downloads, relevância dos editais, formatos, PWA, acessibilidade, navegação, prova real, discursivas, metadados, sincronização e governança. Ao final, comprova que a fonte canônica permaneceu byte a byte inalterada.

Os pull requests também executam Playwright contra o artefato local e, para a camada de progresso, testes com Firebase Emulator e regras do Firestore.

O pipeline editorial completo continua disponível em `npm run check:release`, mas deve ser usado somente depois que uma operação autorizada gerar os arquivos transitórios de exportação do Notion. Ele não é o comando padrão de auditoria de um clone limpo.

## Governança de publicação

- pull requests executam apenas validação de leitura e não publicam;
- o GitHub Pages publica somente a partir da `main`, por autorização controlada presa a um SHA exato;
- antes do deploy, a suíte pública completa roda contra o artefato local;
- depois do deploy, a mesma suíte é repetida no endereço público;
- o verificador final confirma metadados, PWA, catálogo e commit efetivamente servidos;
- sincronização editorial, escrita e fechamento de rastreabilidade no Notion exigem autorização operacional específica;
- o recibo cumulativo do último deploy distingue o commit da interface do recibo editorial que formou o acervo.
