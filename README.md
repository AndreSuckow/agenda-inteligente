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

## Proxima etapa tecnica

Para sincronizar entre dispositivos, adicionar backend TypeScript, autenticacao Google, banco para usuarios/eventos/mensagens/conexoes, API de conversa, OAuth do Google Calendar e servico TTS/STT configuravel por ambiente. WhatsApp fica fora da v1, conforme combinado.

## Publicar na web

```bash
npm run build
```

A saida fica em `dist`. Em Vercel ou Netlify, use `npm run build` como comando e `dist` como diretorio de publicacao. Adicione a URL de producao as origens autorizadas do Google Cloud quando o OAuth for configurado.

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

O nucleo web navegavel, responsivo e otimizado esta implementado. O build de producao passa, com JavaScript principal na faixa de 73 kB gzip. Login Google, persistencia multi-dispositivo, sincronizacao efetiva com Google Agenda e clonagem real de voz dependem do backend, credenciais e servicos externos descritos acima.
