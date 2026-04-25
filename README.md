# Poker Night v2

App Next.js para gerenciar torneios presenciais de poker com código de convite, timer client-authoritative, jogadores, ranking, extras e acerto final.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Upstash Redis via REST
- Netlify

## Desenvolvimento

```bash
npm install
npm run dev
```

## Variáveis de ambiente

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Sem essas variáveis, o app usa storage em memória apenas para desenvolvimento local.

## Validação

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

## Deploy

Build command: `npm run build`

Publish directory: `.next`
