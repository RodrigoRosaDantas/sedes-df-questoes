# Release 2.4 — suporte nativo a Certo/Errado

## Escopo

A plataforma passa a aceitar simultaneamente:

- múltipla escolha A–E;
- julgamento de item em Certo/Errado;
- questões anuladas em ambos os formatos.

Questões Certo/Errado são preservadas no formato original. O pipeline cria somente as opções `Certo` e `Errado`, sem conversão para cinco alternativas.

## Situação editorial

O Banco Mestre possui 2.439 registros. A release pública permanece com 570 questões e 35 materiais enquanto os novos lotes passam pela auditoria editorial.

Dois lotes de prova anterior estão mapeados:

- 120 itens — Gestor PPGE — Administração — SEEDF/DF — Quadrix 2022 — Tipo A;
- 120 itens — Professor de Educação Básica — Administração — SEEDF/DF — Quadrix 2025 — Tipo A.

Os 240 itens têm transcrição e gabarito manual conferidos. A publicação depende do fechamento dos metadados, das ocorrências de imagem/anulação e da indicação transparente do status dos comentários.

## Proteções

O validador exige:

- gabarito `Certo`, `Errado` ou `Anulada` para itens C/E;
- opções exatamente `Certo` e `Errado`;
- IDs e códigos únicos;
- enunciado presente;
- comentário editorial ou indicação explícita de comentário pendente em prova anterior;
- hashes e contagens consistentes no catálogo e no manifesto.
