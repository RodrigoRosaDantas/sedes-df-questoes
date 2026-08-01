# Correção final da publicação excepcional — 01/08/2026

A tentativa anterior gerou 1.846 questões elegíveis e 2.536 questões totais na release candidata, mas falhou porque um pós-processador exigia a presença da questão `PROVA-QDX-CRTR12-2026-AUXILIAR-ADMINISTRATIVO-200-035`.

Essa questão havia sido corretamente excluída como duplicada de conteúdo de `PROVA-QDX-CRTR12-2026-AGENTE-FISCAL-300-035`. A exigência posterior era contraditória com a deduplicação autorizada.

Correção aplicada:

- remoção do pós-processador específico do build permanente;
- preservação da deduplicação por conteúdo;
- manutenção das 690 questões já publicadas;
- reexecução do lote com os mesmos critérios: já publicada, anulada e duplicada;
- nenhuma restauração por rollback amplo do repositório.
