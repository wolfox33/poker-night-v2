# Poker Night v2 - Memória do Projeto

## 2026-04-15

### Deploy Netlify - Problemas e Soluções

**Deploy Status**: ✅ Fazendo deploy, mas APIs retornam erros

**Problema 1: 403 Forbidden no Stream SSE**
- **Causa**: Frontend envía token via query parameter (`?token=xxx`) mas a API tentava ler do Authorization header
- **Solução**: Alterar stream route para ler dos query params
- **Arquivo**: `src/app/api/tournament/[id]/stream/route.ts`

**Problema 2: 500 Internal Server Error**
- **Possível causa**: Variáveis de ambiente UPSTASH não configuradas no Netlify
- **Solução**: Verificar painel do Netlify → Site Settings → Environment Variables

### Código Corrigido

```typescript
// src/app/api/tournament/[id]/stream/route.ts
// ANTES (errado):
const authHeader = request.headers.get('authorization');
const token = authHeader?.replace('Bearer ', '');

// DEPOIS (corrigido):
const url = new URL(request.url);
const token = url.searchParams.get('token');
```

### Histórico
- Commit: `023fc72` - fix: read token from query params in stream SSE endpoint
- App funcionando localmente com `npm run dev`
- Upstash Redis configurado como storage
- Timer era sincronizado via servidor neste momento histórico; decisão posterior mudou para timer client-authoritative.


## 2026-04-24

### Timer - Decisão Arquitetural Atual

- Commit de referência: `6f498f3` - `feat: client-authoritative timer - eliminate server-side loop`
- Decisão: não rodar loop de timer no servidor/SSE.
- Servidor persiste estado base do timer e processa ações `start`, `pause`, `reset`, `skip` e `advance`.
- Clientes calculam a contagem localmente a partir de `startedAt` e `timeRemaining`; quando chega a zero, um cliente dispara `advance`.
- Motivo: evitar dependência de `setInterval`/`setTimeout` em memória de processo, que é frágil em Netlify/serverless.

## 2026-04-25

### Revisão Pré-build - Correções de Estabilização

- Sincronização confiável passou a ser polling controlado em `/state`; SSE fica como snapshot inicial, sem broadcast em `Map` de memória.
- `advance` do timer pode ser disparado por player autenticado, mas só avança se o servidor calcular que o nível venceu; há lock curto por nível/`startedAt` para reduzir avanço duplicado.
- Upstash Redis agora falha alto em operações de KV em vez de engolir erros, para rotas críticas retornarem 500 quando persistência falhar.
- Rebuys passaram a manter contadores separados `rebuySingleCount` e `rebuyDoubleCount`, preservando `rebuys` como total/compatibilidade.
- UI voltou a exibir cada rebuy como badge individual removível; a API aceita `removeRebuy` para corrigir lançamentos adicionados por engano.
- Ranking finalizado pode ser reaberto pelo host via `POST /ranking` com `{ action: "reopen" }`, voltando para `running` ou `setup`.
- `buyIn` pode ser `0`; o host pode finalizar sem ranking com `{ action: "finishWithoutRanking" }` para usar o app como calculadora de extras/acerto.
- Códigos de convite passaram a ter 3 caracteres para simplificar entrada em torneios com poucos usuários.
- Visualizar torneio por código não cria jogador. Apenas o host adiciona jogadores; espectadores entram como `role: none`.

## 2026-04-27

### Cloudflare - Persistência Obrigatória

- Erro observado em produção: `/api/tournament/{id}/state` retornando 404 logo após criar/acessar torneio.
- Causa provável: variáveis `UPSTASH_REDIS_REST_URL` e/ou `UPSTASH_REDIS_REST_TOKEN` ausentes no Cloudflare, fazendo o app cair para storage em memória serverless/edge.
- Decisão: fallback em memória deve existir apenas em desenvolvimento local; em produção, KV falha alto com erro explícito de Redis não configurado.
- Torneios criados antes das variáveis do Upstash estarem ativas não são recuperáveis se ficaram apenas em memória. O frontend deve limpar a sessão local quando `/state` retorna 404 para parar polling/SSE em IDs inválidos.
- A validação de variáveis do Upstash não pode rodar no import do módulo, porque `next build` coleta dados das rotas com `NODE_ENV=production` e a Cloudflare pode não expor secrets de runtime nessa etapa. Validar somente quando uma operação KV for executada.
- `wrangler deploy` usa configuração local e pode sobrescrever variáveis configuradas no dashboard. Manter `UPSTASH_REDIS_REST_URL` em `wrangler.jsonc` e configurar `UPSTASH_REDIS_REST_TOKEN` como Secret no Worker. Se o token aparecer em log, rotacionar no Upstash.
- Para Next.js no Cloudflare Workers, não usar `npx wrangler deploy` diretamente. Usar `npx @opennextjs/cloudflare build` como build command e `npx @opennextjs/cloudflare deploy` como deploy command; o adapter gera `.open-next/worker.js` e assets.
