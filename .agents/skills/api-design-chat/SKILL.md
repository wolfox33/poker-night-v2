---
name: api-design-chat
description: Padrões de design de API REST para aplicações de chat incluindo route handlers, authentication, validation, error handling, rate limiting e streaming endpoints.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 5
  tags: [api, rest, nextjs, authentication, validation, chat]
  compatible_with: [antigravity, windsurf, opencode]
---

# API Design for Chat Applications

Guia completo de design de APIs para chat com Next.js Route Handlers.

## 🎯 Objetivo

Fornecer:
- **RESTful design** patterns
- **Authentication** middleware
- **Input validation** (Zod)
- **Error handling** consistente
- **Rate limiting** patterns
- **Streaming** endpoints

## Quick Reference

### Authenticated Endpoint

```typescript
// app/api/conversations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/core/auth'
import { db } from '@/core/db'

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const conversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, session.user.id))

  return NextResponse.json({ conversations })
}
```

### Validation with Zod

```typescript
import { z } from 'zod'

const createMessageSchema = z.object({
  conversationId: z.number(),
  content: z.string().min(1).max(10000),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  
  const result = createMessageSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: result.error.issues },
      { status: 400 }
    )
  }

  // Use validated data
  const { conversationId, content } = result.data
}
```

### Rate Limiting

```typescript
// core/rate-limit.ts
// Rate limiter simples em memória (para produção, usar Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

interface RateLimitConfig {
  windowMs: number    // Janela de tempo em ms
  maxRequests: number // Máx requests por janela
}

export function rateLimit(
  key: string,
  config: RateLimitConfig = { windowMs: 60_000, maxRequests: 20 }
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + config.windowMs })
    return { success: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { success: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}
```

```typescript
// Uso em Route Handler
import { rateLimit } from '@/core/rate-limit'

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit por userId (20 requests/minuto)
  const limit = rateLimit(`chat:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 20,
  })

  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  // ... processo normal
}
```

> **Produção**: Substituir Map por Redis (`@upstash/ratelimit` ou similar) para funcionar em múltiplas instâncias/serverless.

## 📖 Resources

- [API Patterns](./resources/api-patterns.md)
- [Error Handling](./resources/error-handling.md)

## 🔗 Links Úteis

- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Zod Documentation](https://zod.dev)
