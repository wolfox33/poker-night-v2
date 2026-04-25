---
name: realtime-chat-implementation
description: Patterns de implementação de chat em tempo real com streaming, Server-Sent Events (SSE), WebSockets, optimistic updates, message persistence, loading states e error handling. Integração com Next.js 16, React Server Components e Vercel AI SDK.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 6
  tags: [chat, realtime, streaming, sse, websockets, optimistic-updates, react]
  compatible_with: [antigravity, windsurf, opencode]
---

# Real-time Chat Implementation

Guia completo para implementar chat em tempo real com streaming de respostas, SSE e optimistic updates.

## 🎯 Objetivo

Fornecer:
- **Streaming patterns** (SSE vs WebSockets)
- **Optimistic updates** para UX
- **Message persistence** correto
- **Loading states** e indicadores
- **Error handling** (timeout, network)
- **Retry logic** robusto
- **Message ordering** garantido

## Use this skill when

- Implementando chat interface
- Building real-time messaging
- Streaming AI responses
- Precisando de UX responsiva
- Handling network issues
- Implementing retry logic
- Building conversation UI

## Do not use this skill when

- Apenas request/response simples
- Não precisa de real-time
- Batch processing (não interativo)
- Sistema muito simples

## Instructions

1. **Choose transport**: SSE vs WebSockets
2. **Implement streaming**: Server-side streaming
3. **Client implementation**: React hooks para SSE
4. **Optimistic updates**: Update UI before server confirms
5. **Persistence**: Save messages após streaming
6. **Error handling**: Timeout, network errors, retry
7. **Loading states**: Typing indicators, skeleton
8. **Message ordering**: Timestamp-based ordering

Consulte `resources/streaming-guide.md` para guia de streaming, `resources/sse-patterns.md` para SSE patterns e `resources/optimistic-updates.md` para optimistic UI.

## Safety

- **VALIDAR** user input antes de enviar
- **SANITIZAR** AI output antes de exibir
- **IMPLEMENTAR** rate limiting
- **USAR** timeouts para prevenir hanging
- **PERSISTIR** messages apenas após sucesso
- **LOG** errors para debugging
- **IMPLEMENTAR** retry com backoff

## 📚 Quick Reference

### SSE Endpoint (Next.js)

```typescript
// app/api/chat/stream/route.ts
import { NextRequest } from 'next/server'
import { auth } from '@/core/auth'
import { z } from 'zod'

const streamSchema = z.object({
  content: z.string().min(1).max(10000),
  conversationId: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  // 1. Autenticar
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Validar input
  const body = await req.json()
  const result = streamSchema.safeParse(body)
  if (!result.success) {
    return new Response('Invalid input', { status: 400 })
  }

  const { content, conversationId } = result.data

  // 3. Verificar ownership da conversa
  const conversation = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, session.user.id)
      )
    )
    .limit(1)

  if (!conversation[0]) {
    return new Response('Conversation not found', { status: 404 })
  }

  // 4. Stream response
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of aiResponse) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          )
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

### React Hook

```typescript
const { messages, sendMessage, isLoading } = useChat({
  api: '/api/chat/stream',
})
```

## 🔄 Transport Options

### SSE (Server-Sent Events)

**Quando usar**:
- Streaming unidirecional (server → client)
- AI chat responses
- Simpler setup
- HTTP/2 friendly

**Vantagens**:
- ✅ Automatic reconnection
- ✅ Built-in event IDs
- ✅ Works through HTTP
- ✅ Simple protocol

**Desvantagens**:
- ❌ Unidirecional apenas
- ❌ Max 6 connections (HTTP/1.1)
- ❌ No binary data (text only)

```typescript
// Client
const eventSource = new EventSource('/api/stream')
eventSource.onmessage = (event) => {
  console.log(event.data)
}
```

### WebSockets

**Quando usar**:
- Bidirecional communication
- Low latency required
- Binary data
- Multiplayer features

**Vantagens**:
- ✅ Full duplex
- ✅ Binary support
- ✅ Low latency
- ✅ No connection limit

**Desvantagens**:
- ❌ More complex
- ❌ Requires WebSocket server
- ❌ Manual reconnection

```typescript
// Client
const ws = new WebSocket('ws://localhost:3000')
ws.onmessage = (event) => {
  console.log(event.data)
}
```

**Recomendação para Chat AI**: **SSE** (mais simples, suficiente para streaming de respostas)

## 🚀 Implementation

### Server-Side Streaming

```typescript
// app/api/chat/stream/route.ts
import { NextRequest } from 'next/server'
import { streamResponse } from '@/features/chat/service/stream-response'
import { auth } from '@/core/auth'
import { z } from 'zod'

const streamSchema = z.object({
  content: z.string().min(1).max(10000),
  conversationId: z.number().int().positive(),
  templateId: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Validate input
  const body = await req.json()
  const parsed = streamSchema.safeParse(body)
  if (!parsed.success) {
    return new Response('Invalid input', { status: 400 })
  }

  const { content, conversationId, templateId } = parsed.data

  // 3. Verify conversation ownership (prevent IDOR)
  const conversation = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, session.user.id)
      )
    )
    .limit(1)

  if (!conversation[0]) {
    return new Response('Conversation not found', { status: 404 })
  }

  // 4. Get AI stream
  const aiStream = await streamResponse({
    userId: session.user.id,
    conversationId,
    templateId,
    content,
  })

  // Convert to SSE
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        let fullResponse = ''

        for await (const chunk of aiStream) {
          const messages = chunk.messages
          const lastMessage = messages[messages.length - 1]

          if (lastMessage && lastMessage._getType() === 'ai') {
            fullResponse = lastMessage.content as string

            // Send chunk
            const data = JSON.stringify({
              content: fullResponse,
              done: false,
            })

            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }
        }

        // Persist message após streaming completo
        await db.insert(messages).values({
          conversationId,
          role: 'assistant',
          content: fullResponse,
        })

        // Send done event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ content: fullResponse, done: true })}\n\n`
          )
        )

        controller.close()
      } catch (error) {
        console.error('Stream error:', error)

        // Send error event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: 'Failed to stream response', done: true })}\n\n`
          )
        )

        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
```

### Client-Side Hook

```typescript
// features/chat/hooks/use-chat-stream.ts
import { useState, useCallback } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export function useChatStream(conversationId: number) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')

  const sendMessage = useCallback(
    async (content: string) => {
      setIsLoading(true)
      setError(null)
      setStreamingContent('')

      // Optimistic update - add user message immediately
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, conversationId }),
        })

        if (!response.ok) {
          throw new Error('Failed to send message')
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader!.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6))

              if (data.error) {
                setError(data.error)
                break
              }

              if (data.done) {
                // Add final AI message
                const aiMessage: Message = {
                  id: `ai-${Date.now()}`,
                  role: 'assistant',
                  content: data.content,
                  createdAt: new Date(),
                }

                setMessages((prev) => [...prev, aiMessage])
                setStreamingContent('')
              } else {
                // Update streaming content
                setStreamingContent(data.content)
              }
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id))
      } finally {
        setIsLoading(false)
      }
    },
    [conversationId]
  )

  return {
    messages,
    streamingContent,
    isLoading,
    error,
    sendMessage,
  }
}
```

### Chat Component

```typescript
// features/chat/components/ChatInterface.tsx
'use client'

import { useState } from 'react'
import { useChatStream } from '@/features/chat/hooks/use-chat-stream'

export function ChatInterface({ conversationId }: { conversationId: number }) {
  const [input, setInput] = useState('')
  const { messages, streamingContent, isLoading, error, sendMessage } =
    useChatStream(conversationId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    await sendMessage(input)
    setInput('')
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-900'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-lg p-3 bg-gray-200 text-gray-900">
              {streamingContent}
              <span className="animate-pulse">▋</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border rounded-lg px-4 py-2"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

## ⚡ Optimistic Updates

### Pattern 1: Add Immediately, Remove on Error

```typescript
const sendMessage = async (content: string) => {
  // Add optimistically
  const tempId = `temp-${Date.now()}`
  const optimisticMessage = { id: tempId, role: 'user', content, pending: true }

  setMessages((prev) => [...prev, optimisticMessage])

  try {
    const response = await fetch('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ content }),
    })

    if (!response.ok) throw new Error('Failed')

    const { messageId } = await response.json()

    // Replace temp with real ID
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId ? { ...m, id: messageId, pending: false } : m
      )
    )
  } catch (error) {
    // Remove on error
    setMessages((prev) => prev.filter((m) => m.id !== tempId))
    setError('Failed to send message')
  }
}
```

### Pattern 2: Mark as Pending

```typescript
interface Message {
  id: string
  content: string
  pending?: boolean
  error?: boolean
}

// UI
{message.pending && <Spinner />}
{message.error && <RetryButton />}
```

## 🛡️ Error Handling

### Timeout

```typescript
const sendMessageWithTimeout = async (content: string, timeout = 30000) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ content }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout')
    }
    throw error
  }
}
```

### Retry Logic

```typescript
const sendMessageWithRetry = async (
  content: string,
  maxRetries = 3,
  baseDelay = 1000
) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await sendMessage(content)
    } catch (error) {
      if (attempt === maxRetries - 1) throw error

      const delay = baseDelay * 2 ** attempt
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
```

## 📖 Resources

- [Streaming Guide](./resources/streaming-guide.md) - Guia completo de streaming
- [SSE Patterns](./resources/sse-patterns.md) - Patterns de SSE
- [Optimistic Updates](./resources/optimistic-updates.md) - Optimistic UI patterns

## 🔗 Links Úteis

- [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [React Query](https://tanstack.com/query/latest)
- [WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
