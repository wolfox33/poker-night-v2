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
- Timer sincronizado via servidor (não afetado por background do celular)
