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
