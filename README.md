# Poker Night v2

App Next.js para gerenciar torneios presenciais de poker com código de convite, timer client-authoritative, jogadores, ranking, extras e acerto final.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Upstash Redis via REST
- Cloudflare

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
Em produção, essas variáveis são obrigatórias. Sem elas, torneios podem ser perdidos entre requests em ambientes serverless/edge.

## Validação

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

## Deploy

Build command: `npx @opennextjs/cloudflare build`

Deploy command: `npx @opennextjs/cloudflare deploy`

Output directory: `.open-next`

Na Cloudflare, configure as variáveis em `Workers & Pages` → projeto → `Settings` → `Variables and Secrets`:

- `UPSTASH_REDIS_REST_URL` como texto comum, ou em `wrangler.jsonc`
- `UPSTASH_REDIS_REST_TOKEN` como Secret

Se usar `wrangler deploy`, mantenha `UPSTASH_REDIS_REST_URL` no `wrangler.jsonc` e configure `UPSTASH_REDIS_REST_TOKEN` como Secret no Worker. Variáveis comuns configuradas apenas pelo dashboard podem ser removidas quando o deploy usa configuração local.

Não use `npx wrangler deploy` diretamente para este app Next.js. O deploy deve passar pelo adapter OpenNext para gerar `.open-next/worker.js`.
