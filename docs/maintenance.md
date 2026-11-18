# Manutenção

## Preparação do ambiente

```powers
npm install
copy .env.example .env
npm run dev
```

`PORT` altera a porta da API. `DATA_DIR` pode apontar para uma pasta externa ao repositório.

## Verificações

```powers
npm run typecheck
npm run lint
npm run test
npm run build
```

Execute os testes após alterações em `server/business-rules.ts`, `server/task-repository.ts` ou `server/index.ts`.

## Migrações

As migrações ficam em `server/migrations/` e são executadas ao iniciar a API. O número do nome determina a ordem e é registrado em `schema_migrations`. A migração `002_task_deletion_history.sql` adiciona o horário de exclusão sem remover atividades existentes. Nunca edite uma migração já aplicada; crie o próximo arquivo versionado.

Antes de atualizar o banco em produção, faça backup de `agenda.db` e do arquivo WAL associado, se existir.

## Backup e recuperação

```powers
copy data\agenda.db agenda-backup.db
```

Para recuperar, pare a aplicação e substitua `data\agenda.db` pelo backup. Não mantenha backups ativos com o processo escrevendo no banco original.

## Dados demonstrativos

`npm run seed` insere uma atividade demonstrativa. Não é executado automaticamente e não remove dados existentes.

## Logs e diagnóstico

A API registra no terminal a inicialização e erros técnicos do servidor. O navegador mostra mensagens compreensíveis em caso de falha. Não há configuração de logs persistentes nesta entrega.

Problemas comuns:

- Porta ocupada: altere `PORT` e mantenha o proxy em `vite.config.ts` apontando para a mesma porta.
- Banco não gravável: verifique permissões da pasta `data` ou configure `DATA_DIR`.
- Microfone indisponível: use Chrome ou Edge em `localhost`/HTTPS e conceda permissão ao navegador.
- Erro de validação: confirme os campos da atividade e consulte o detalhe técnico retornado pela API no terminal.

## Onde alterar

- Prioridades e tipos: `server/business-rules.ts`.
- Ordenação e consultas: `server/task-repository.ts`.
- Campos e validação externa: `server/index.ts`.
- Recorrência: `createNextOccurrence` em `server/task-repository.ts`.
- Filtros e cards: `src/App.tsx`.
- Visualização mensal e distribuição das atividades por prazo: `src/components/MonthCalendar.tsx`.
- Botão de voz: `src/App.tsx`; permanece visível, mas desativado temporariamente.
- Exibição e filtros de criação: `created_at` no repositório e controles de período em `src/App.tsx`.
- Cores e espaçamentos: classes Tailwind e `src/index.css`.
