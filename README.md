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

O pipeline reconstrói a release, aplica o snapshot do Notion, gera o índice de estudo, cria `build-info.json` e `release-meta.json`, verifica hashes, catálogo, materiais, downloads, PWA, prova real, backups, reporte, revisão adaptativa e reprodutibilidade.

Pull requests apenas validam. Somente a branch `main`, após aprovação de todas as verificações, pode publicar o GitHub Pages.
