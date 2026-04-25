# Poker Night v2 - Contexto do Projeto

## Descrição
App de poker para gerenciamento de torneios com timer client-authoritative, estado sincronizado via SSE, sistema de players, ranking e controle de accesso via link compartilhado.

## Stack
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Route Handlers)
- **Database**: Upstash Redis (via REST API)
- **Hosting**: Netlify
- **Sync**: Server-Sent Events (SSE) para estado do torneio; contagem do timer calculada no cliente a partir de `startedAt`

## Arquitetura

### APIs
- `POST /api/tournament/create` - Criar tournament
- `POST /api/tournament/join` - Jogador entra via código
- `GET /api/tournament/[id]/state` - Estado atual do tournament
- `POST /api/tournament/[id]/timer` - Controlar timer (host only)
- `GET /api/tournament/[id]/stream` - SSE stream para estado inicial e broadcasts
- `POST /api/tournament/[id]/players` - Add/remove players
- `POST /api/tournament/[id]/config` - Atualizar config
- `POST /api/tournament/[id]/ranking` - Atualizar ranking

### Frontend
- Landing page com options: criar/join tournament
- Dashboard com timer, players list, ranking
- Hook `useTournament` para gerenciamento de estado, sync SSE, retry/backoff e polling fallback

### Timer
- Decisão atual: timer client-authoritative.
- O servidor persiste `isRunning`, `startedAt`, `timeRemaining`, `totalElapsed` e `currentLevel`.
- Clientes interpolam a contagem localmente e enviam `advance` quando o nível chega a zero.
- Não existe loop server-side por segundo; isso evita dependência de processo em memória em serverless/Netlify.

### Dados (Redis)
- `tournament:{id}` - Dados do tournament (TTL: 24h)
- `code:{code}` - Mapeamento código → ID (TTL: 24h)

## Variáveis de Ambiente
- `UPSTASH_REDIS_REST_URL` - URL do Upstash Redis
- `UPSTASH_REDIS_REST_TOKEN` - Token de acesso

## Deploy
- Netlify com build command: `npm run build`
- Publish directory: `.next`
