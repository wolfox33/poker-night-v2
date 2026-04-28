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
KEEPALIVE_SECRET=
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

Build command: `npm run build`

Deploy command: `npx wrangler deploy`

Output directory: `.open-next`

Current Cloudflare deployment path: OpenNext adapter with `wrangler.jsonc`.

Na Cloudflare, configure as variáveis em `Workers & Pages` → projeto → `Settings` → `Variables and Secrets`:

- `UPSTASH_REDIS_REST_URL` como texto comum, ou em `wrangler.jsonc`
- `UPSTASH_REDIS_REST_TOKEN` como Secret
- `KEEPALIVE_SECRET` como Secret

Se usar `wrangler deploy`, mantenha `UPSTASH_REDIS_REST_URL` no `wrangler.jsonc` e configure `UPSTASH_REDIS_REST_TOKEN` como Secret no Worker. Variáveis comuns configuradas apenas pelo dashboard podem ser removidas quando o deploy usa configuração local.

O script `npm run build` executa `next build` e depois `opennextjs-cloudflare build --skipNextBuild`, gerando `.open-next/worker.js` para o `wrangler deploy`.

## Upstash Keepalive

O endpoint `GET /api/keepalive` escreve a chave `keepalive:lastPing` no Redis. Ele exige `Authorization: Bearer {KEEPALIVE_SECRET}`.

O workflow `.github/workflows/upstash-keepalive.yml` chama esse endpoint a cada 5 dias. Configure estes secrets no GitHub:

- `KEEPALIVE_URL`: URL pública da aplicação, sem barra final
- `KEEPALIVE_SECRET`: mesmo valor configurado como Secret na Cloudflare
