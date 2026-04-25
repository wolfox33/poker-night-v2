# Poker Night v2 - Contexto do Projeto

## Descrição
App de poker para gerenciamento de torneios com timer client-authoritative, visualização por código curto, sistema de players gerenciado pelo host, ranking opcional, extras e acerto de contas.

## Stack
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Route Handlers)
- **Database**: Upstash Redis (via REST API)
- **Hosting**: Netlify
- **Sync**: polling controlado em `/state` como fonte confiável em Netlify/serverless; SSE entrega snapshot inicial quando disponível; contagem do timer calculada no cliente a partir de `startedAt`

## Arquitetura

### APIs
- `POST /api/tournament/create` - Criar tournament
- `POST /api/tournament/join` - Resolver código para visualização anônima do tournament; não cria jogador
- `GET /api/tournament/[id]/state` - Estado atual do tournament
- `POST /api/tournament/[id]/timer` - Controlar timer (host only)
- `GET /api/tournament/[id]/stream` - SSE stream para snapshot inicial
- `POST /api/tournament/[id]/players` - Add/remove players, addon e rebuys individuais (host only)
- `POST /api/tournament/[id]/config` - Atualizar config
- `POST /api/tournament/[id]/ranking` - Finalizar com ranking, finalizar sem ranking ou reabrir tournament

### Frontend
- Landing page com opções: criar tournament ou visualizar por código de 3 caracteres
- Dashboard com timer, players list, ranking opcional, extras e acerto
- Hook `useTournament` para gerenciamento de estado, snapshot SSE quando há token e polling controlado como sync confiável
- Visualizadores por código entram como `role: none`; apenas o host adiciona jogadores.

### Timer
- Decisão atual: timer client-authoritative.
- O servidor persiste `isRunning`, `startedAt`, `timeRemaining`, `totalElapsed` e `currentLevel`.
- Clientes interpolam a contagem localmente e enviam `advance` quando o nível chega a zero; a API valida timer vencido e usa lock curto por nível.
- Não existe loop server-side por segundo; isso evita dependência de processo em memória em serverless/Netlify.

### Dados (Redis)
- `tournament:{id}` - Dados do tournament (TTL: 24h)
- `code:{code}` - Mapeamento código → ID (TTL: 24h)
- `advance:{id}:{level}:{startedAt}` - Lock curto para reduzir avanço duplicado de nível

### Regras atuais
- Código de convite tem 3 caracteres uppercase sem caracteres ambíguos.
- `buyIn` pode ser 0 para usar o app como calculadora de extras/acerto.
- Torneio pode ser finalizado sem ranking via `finishWithoutRanking`.
- Ranking finalizado pode ser reaberto pelo host para ajustes.

## Variáveis de Ambiente
- `UPSTASH_REDIS_REST_URL` - URL do Upstash Redis
- `UPSTASH_REDIS_REST_TOKEN` - Token de acesso

## Deploy
- Netlify com build command: `npm run build`
- Publish directory: `.next`
