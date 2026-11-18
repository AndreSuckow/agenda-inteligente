# Agenda Inteligente

Aplicação web para cadastrar, pesquisar, concluir e excluir atividades. Também permite criar uma atividade ou solicitar a exclusão por comando de voz em navegadores compatíveis.

## Requisitos

- Node.js 20 ou superior
- npm
- Navegador Chromium moderno para reconhecimento de voz

## Instalação e execução

```powers
npm install
npm run dev
```

A interface fica disponível em `http://localhost:5173` e a API em `http://localhost:3001`.

Sem configuração do Supabase, o desenvolvimento local continua usando SQLite em `data/agenda.db`.

## Publicação com contas Google e dados compartilhados

A interface pode ser publicada gratuitamente no GitHub Pages. Para persistir os dados entre dispositivos, o projeto também pode usar o plano gratuito do Supabase (PostgreSQL e autenticação Google). Cada conta Google recebe dados isolados pelas políticas RLS da migração `supabase/migrations/20261117000100_initial_schema.sql`.

1. Crie um projeto Supabase e execute o SQL da migração pelo SQL Editor.
2. Em **Authentication → Providers**, habilite Google e configure as credenciais OAuth do Google. Use o callback exibido pelo Supabase no Google Cloud.
3. Em **Authentication → URL Configuration**, defina **Site URL** como `https://OWNER.github.io/REPOSITORY/` e cadastre `http://localhost:5173/` e `https://OWNER.github.io/REPOSITORY/` em **Redirect URLs**.
4. Copie a URL do projeto e a chave **publishable/anon** para `.env.local` como `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. A chave `service_role` nunca deve ser usada no frontend.
5. No repositório GitHub, cadastre os mesmos valores como Actions secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Configure Pages para publicar pela opção **GitHub Actions**. O workflow `.github/workflows/deploy-pages.yml` publica a branch `main`.

Para importar os dados SQLite atuais, primeiro entre uma vez com Google pelo app publicado e copie o ID dessa conta em **Authentication → Users**. Depois, no PowerShell local, execute:

```powershell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
$env:SUPABASE_USER_ID = "google-user-id"
npm run import:supabase
```

O script aborta se essa conta já tiver tarefas ou aniversários e remove os registros parciais se a importação falhar. Mantenha a `service_role` somente no ambiente local; nunca a coloque no repositório ou no frontend.

Projetos Supabase gratuitos podem ser pausados após uma semana sem atividade e não incluem backups baixáveis.

## Comandos úteis

```powers
npm run dev
npm run build
npm run typecheck
npm run lint
npm run test
npm run start
npm run seed
```

O banco SQLite é criado automaticamente em `data/agenda.db`. `npm run seed` é opcional e apenas inserta dados demonstrativos; os comandos comuns não apagam dados.

Consulte a documentação em [docs/architecture.md](docs/architecture.md), [docs/business-rules.md](docs/business-rules.md) e [docs/maintenance.md](docs/maintenance.md).
