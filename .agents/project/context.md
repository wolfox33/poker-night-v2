# Poker Night v2 - Contexto do Projeto

## Descrição
App de poker para gerenciamento de torneios com timer sincronizado via servidor (SSE), sistema de players, ranking e controle de accesso via link compartilhado.

## Stack
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Route Handlers)
- **Database**: Upstash Redis (via REST API)
- **Hosting**: Netlify
- **Sync**: Server-Sent Events (SSE) para timer em tempo real

## Arquitetura

### APIs
- `POST /api/tournament/create` - Criar tournament
- `POST /api/tournament/join` - Jogador entra via código
- `GET /api/tournament/[id]/state` - Estado atual do tournament
- `POST /api/tournament/[id]/timer` - Controlar timer (host only)
- `GET /api/tournament/[id]/stream` - SSE stream para sync em tempo real
- `POST /api/tournament/[id]/players` - Add/remove players
- `POST /api/tournament/[id]/config` - Atualizar config
- `POST /api/tournament/[id]/ranking` - Atualizar ranking

### Frontend
- Landing page com options: criar/join tournament
- Dashboard com timer, players list, ranking
- Hook `useTournament` para gerenciamento de estado e sync SSE

### Dados (Redis)
- `tournament:{id}` - Dados do tournament (TTL: 24h)
- `code:{code}` - Mapeamento código → ID (TTL: 24h)

## Variáveis de Ambiente
- `UPSTASH_REDIS_REST_URL` - URL do Upstash Redis
- `UPSTASH_REDIS_REST_TOKEN` - Token de acesso

## Deploy
- Netlify com build command: `npm run build`
- Publish directory: `.next`
