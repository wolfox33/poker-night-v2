---
name: performance-optimization-chat
description: Padrões de otimização de performance para aplicações de chat incluindo caching strategies, database indexing, query optimization, streaming optimization, bundle size reduction e monitoring.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 6
  tags: [performance, optimization, caching, monitoring, database, chat]
  compatible_with: [antigravity, windsurf, opencode]
---

# Performance Optimization for Chat

Guia completo de otimização de performance para aplicações de chat.

## 🎯 Objetivo

Fornecer:
- **Caching strategies** (Next.js, React Query)
- **Database optimization** (indexes, query optimization)
- **Streaming optimization** (batching, compression)
- **Bundle size reduction** (code splitting, tree shaking)
- **Image optimization** (Next.js Image)
- **Monitoring & profiling** (Vercel Analytics, custom metrics)

## Use this skill when

- App feeling slow
- Database queries slow
- Bundle size too large
- High server costs
- Poor user experience
- Need analytics/monitoring

## Quick Reference

### Next.js Caching

```typescript
// Cached for 1 hour
const posts = await fetch('/api/posts', {
  next: { revalidate: 3600 },
})

// Cache with tags
const data = await fetch('/api/data', {
  next: { tags: ['posts'] },
})

// Revalidate
import { revalidateTag } from 'next/cache'
revalidateTag('posts')
```

### Database Indexes

```typescript
// Create indexes for common queries
export const messagesIndexes = {
  conversationIdx: index('messages_conversation_id_idx').on(
    messages.conversationId
  ),
  createdAtIdx: index('messages_created_at_idx').on(messages.createdAt),
  userConversationIdx: index('conversations_user_id_idx').on(
    conversations.userId
  ),
}
```

### Query Optimization

```typescript
// ❌ BAD: N+1 query
const conversations = await db.select().from(conversations)
for (const conv of conversations) {
  const messages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
}

// ✅ GOOD: Single query with join
const conversationsWithMessages = await db
  .select()
  .from(conversations)
  .leftJoin(messages, eq(messages.conversationId, conversations.id))
```

### Code Splitting

```typescript
// Lazy load heavy components
import dynamic from 'next/dynamic'

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Spinner />,
  ssr: false, // Client-side only
})
```

## ⚡ Optimization Patterns

### Pattern 1: React Query Cache

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      cacheTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

// Use in components
const { data } = useQuery({
  queryKey: ['conversations'],
  queryFn: () => fetch('/api/conversations').then((r) => r.json()),
})
```

### Pattern 2: Virtual Scrolling

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function MessageList({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  })

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      {virtualizer.getVirtualItems().map((virtualItem) => (
        <Message key={virtualItem.key} message={messages[virtualItem.index]} />
      ))}
    </div>
  )
}
```

### Pattern 3: Debounce Expensive Operations

```typescript
import { useMemo } from 'react'
import debounce from 'lodash/debounce'

function SearchInput() {
  const debouncedSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        const results = await fetch(`/api/search?q=${query}`)
        // Update results...
      }, 300),
    []
  )

  return <input onChange={(e) => debouncedSearch(e.target.value)} />
}
```

### Pattern 4: Batch Streaming Updates

```typescript
let buffer: string[] = []
let lastFlush = Date.now()
const FLUSH_INTERVAL = 50 // ms

for await (const token of stream) {
  buffer.push(token)

  if (Date.now() - lastFlush > FLUSH_INTERVAL) {
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ tokens: buffer })}\n\n`)
    )
    buffer = []
    lastFlush = Date.now()
  }
}
```

## 📊 Monitoring

### Custom Metrics

```typescript
// lib/metrics.ts
export function trackMetric(name: string, value: number, tags?: Record<string, string>) {
  // Send to analytics service (autenticado via cookie de sessão)
  fetch('/api/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value, tags }),
    credentials: 'include', // Enviar cookies de auth
  })
}

// Usage
trackMetric('message_send_time', performance.now() - startTime)
// ⚠️ NUNCA enviar userId no client — extrair do session no server
```

```typescript
// app/api/metrics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/core/auth'
import { z } from 'zod'

const metricSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.number(),
  tags: z.record(z.string()).optional(),
})

export async function POST(req: NextRequest) {
  // 🔒 Autenticar — prevenir injeção de métricas falsas
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = metricSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid metric' }, { status: 400 })
  }

  // Usar userId do session, não do client
  await saveMetric({
    ...parsed.data,
    userId: session.user.id,
  })

  return NextResponse.json({ ok: true })
}
```

### Performance Monitoring

```typescript
// Monitor API response times
export async function GET(req: NextRequest) {
  const start = performance.now()

  const data = await fetchData()

  const duration = performance.now() - start
  console.log(`API call took ${duration}ms`)

  if (duration > 1000) {
    // Alert on slow requests
    console.warn('Slow API call detected')
  }

  return NextResponse.json(data)
}
```

## 📖 Resources

- [Optimization Guide](./resources/optimization-guide.md)
- [Monitoring Setup](./resources/monitoring-setup.md)

## 🔗 Links Úteis

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Web Vitals](https://web.dev/vitals/)
- [React Query](https://tanstack.com/query/latest)
