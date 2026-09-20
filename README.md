# agenda.

Agenda pessoal organizada por conversa. Esta primeira entrega e uma aplicacao web responsiva feita com React, TypeScript e Vite.

## O que funciona nesta versao

- Calendario semanal responsivo com navegacao por mes e visoes dia, semana e mes.
- Criacao rapida de compromissos pelo botao `Adicionar`.
- Chat em portugues com perguntas para completar dia e horario.
- Confirmacao antes de registrar e protecao contra duplicacao.
- Reconhecimento de voz e resposta falada usando as APIs nativas do navegador.
- Botao `Adicionar palavra de comando`, experimental enquanto a pagina esta aberta.
- Painel de voz com upload de amostra, palavra configuravel e confirmacao de autorizacao.
- Persistencia local dos compromissos no navegador.
- Painel preparado para Google Agenda e WhatsApp v2.

## Rodar localmente

Prerequisito: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Para ativar a IA real em desenvolvimento, copie `.env.example` para `.env`, preencha `AI_API_KEY` no backend e rode:

```bash
npm run dev:all
```

O frontend usa `/api/chat`; o Vite encaminha essa rota para `http://localhost:8787`. A chave fica somente no processo Node e nunca chega ao navegador. O endpoint `GET /api/health` informa se a chave foi carregada.

Validacoes disponiveis:

```bash
npm run build
npm run lint
```

## Voz e palavra de comando

O navegador precisa de permissao para o microfone. Chrome e Edge oferecem o melhor suporte para `SpeechRecognition`; se o recurso nao existir, o campo de texto continua disponivel.

A palavra de comando depende da pagina estar aberta e em primeiro plano. Navegadores nao permitem prometer escuta continua em segundo plano ou com o aparelho bloqueado. Para uma versao confiavel, sera necessario um motor de wake word e validacao em aparelhos reais.

O upload de voz registra a amostra no fluxo da interface, mas nao envia nem clona a voz localmente. A etapa de producao deve coletar consentimento verificavel, processar o arquivo por backend seguro, proteger credenciais, permitir exclusao da voz e nunca imitar terceiros sem autorizacao.

## Google Agenda

A interface reserva o ponto de conexao, mas a sincronizacao real precisa de backend e OAuth. Ative a Google Calendar API no Google Cloud, configure o consentimento, crie Client ID para a origem web e implemente endpoints de OAuth, leitura e criacao de eventos. Tokens devem ficar somente no servidor, associados a conta autenticada.

A meta definida e sincronizacao de escrita: compromissos confirmados no app devem ser criados no Google Agenda, e eventos existentes devem participar da deteccao de conflitos. Use idempotencia/event IDs para evitar duplicacoes.

## IA generativa e backend

O backend inicial está em `server/index.mjs`. Ele usa qualquer endpoint compatível com o formato de Chat Completions, configurado por `AI_API_URL`, e solicita uma resposta JSON estruturada com `ask`, `confirm` ou `create`. Sem `AI_API_KEY`, o app usa o parser local como fallback e informa essa condição na interface.

Para sincronizar entre dispositivos, a próxima camada é adicionar autenticação Google, banco para usuários/eventos/mensagens/conexões, OAuth do Google Calendar e um serviço TTS/STT configurável por ambiente. WhatsApp fica fora da v1, conforme combinado.

## Publicar na web

```bash
npm run build
```

A saida fica em `dist`. O frontend estático do GitHub Pages não consegue executar o backend Node: publique o frontend em Pages e o servidor em Render, Railway, Fly.io ou Vercel Functions. Configure `AI_API_KEY`, `AI_API_URL` e `AI_MODEL` como secrets do serviço de backend e `VITE_API_URL` como variável de build do frontend, apontando para a URL pública da API. Nunca coloque a chave em `VITE_*`.

## GitHub

Com GitHub CLI autenticado:

```bash
git init
git add .
git commit -m "feat: cria agenda inteligente web"
gh repo create AndreSuckow/agenda-inteligente --public --source=. --remote=origin --push
```

O PDF do briefing permanece na raiz. Nunca coloque chaves de API, tokens OAuth ou `.env` no Git.

## Status da entrega

O núcleo web e o backend de IA generativa estão implementados. O build de produção passa, com JavaScript principal na faixa de 74 kB gzip. A IA real funciona assim que `AI_API_KEY` for configurada; login Google, persistência multi-dispositivo, sincronização efetiva com Google Agenda e clonagem real de voz ainda dependem das credenciais e serviços externos descritos acima.
