# Arquitetura

## Visão geral

A aplicação usa uma SPA React com Vite e uma API HTTP Express. Os dados são persistidos localmente em SQLite por meio de `better-sqlite3`. Vite encaminha `/api` para a API na porta 3001 durante o desenvolvimento.

## Responsabilidades

- `src/`: interface React, estados visuais, formulários e integração com a Web Speech API.
- `server/index.ts`: rotas HTTP, validação externa com Zod e tratamento padronizado de erros.
- `server/task-repository.ts`: consultas e alterações das atividades no banco.
- `server/business-rules.ts`: tipos de domínio, atraso e interpretação de comandos de voz.
- `server/subtask-rules.ts`: interpretação da descrição em texto comum e linhas de subtarefas.
- `shared/task-tag-rules.ts`: limites e normalização compartilhada das tags.
- `server/db.ts`: abertura do SQLite e aplicação automática das migrações pendentes.
- `server/migrations/`: esquemas versionados.
- `tests/`: testes das regras de domínio.

## Fluxo

O componente React solicita dados via `/api/tasks`. A API valida o corpo da requisição e delega a persistência ao repositório. O repositório retorna entidades técnicas mapeadas para o formato usado pela interface.

## Modelo de dados

### tasks

- `id`: inteiro, chave primária e identificador visível.
- `title`: texto obrigatório, até 120 caracteres.
- `description`: texto opcional.
- `due_date`: data no formato `YYYY-MM-DD`.
- `due_time`: horário limite local opcional no formato `HH:mm`; nulo significa fim do dia.
- `priority`: `low`, `medium` ou `high`.
- `status`: `pending` ou `completed`.
- `recurrence`: `none`, `daily`, `weekly` ou `monthly`.
- `completed_at`, `created_at`, `updated_at`: instantes ISO armazenados pelo SQLite.
- `deleted_at`: instante UTC da exclusão lógica; nulo para atividades ativas.

### task_subtasks

- `id`: chave primária.
- `task_id`: atividade proprietária, com exclusão em cascata quando a atividade é removida fisicamente.
- `title` e `position`: texto e ordem da subtarefa dentro da atividade.
- `completed`: estado da subtarefa, armazenado como inteiro booleano.
- `created_at` e `updated_at`: instantes de auditoria.

As operações de conclusão e criação da próxima ocorrência usam transações no repositório, para manter o status da atividade e das subtarefas consistentes. A API entrega as subtarefas junto à atividade, sem expor o modelo SQL.

### task_tags

Tags são armazenadas em `task_tags`, ordenadas por posição e ligadas à atividade com exclusão em cascata. A API entrega as tags junto à atividade; no Supabase, elas são armazenadas na coluna `tasks.tags`.

## Decisões técnicas

- SQLite foi escolhido para oferecer instalação local simples e persistência real sem serviço externo.
- Tailwind CSS fornece tokens e utilitários visuais.
- Ícones são fornecidos pela biblioteca Lucide.
- Zod valida dados recebidos pela API.
- Web Speech API é executada no navegador; a API apenas interpreta o texto reconhecido.
