# Firebase — contrato auditável da Plataforma de Questões

Este diretório versiona o contrato de segurança usado nos testes da plataforma SEDES/DF.

## Escopo

- os dados pessoais ficam sob `users/{uid}/...`;
- o próprio usuário só acessa a árvore do seu UID;
- uma conta administrativa pode acessar as árvores somente quando possuir a custom claim `sedesAdmin=true`;
- qualquer caminho fora da árvore autenticada é negado neste contrato;
- a fila de relatos fica em `users/{uid}/apps/sedes-df-questoes/reportQueue/{reportId}` e pode ser consultada administrativamente por collection group ou pelo Console Firebase.

## Projeto físico compartilhado

O projeto Firebase físico também atende integrações legadas. Por isso, este repositório **não publica regras automaticamente em produção**. O arquivo `firestore.rules` é executado obrigatoriamente no Emulator Suite e auditado pelo CI. Antes de qualquer `firebase deploy --only firestore:rules`, o ruleset vigente do projeto físico deve ser reconciliado para garantir que nenhum caminho legítimo externo a `users/{uid}` seja removido.

O CI não usa credenciais reais, não escreve no Firebase de produção e prova o isolamento entre usuários no emulador.
