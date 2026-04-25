# LangGraph Streaming Patterns

Guia completo de implementação de streaming de respostas AI em tempo real usando Server-Sent Events (SSE).

## 🎯 Por que Streaming?

**Benefícios**:
- **UX Superior**: Usuário vê resposta aparecer em tempo real
- **Perceived Performance**: Parece mais rápido mesmo que não seja
- **Early Feedback**: Usuário pode interromper se resposta está errada
- **Engagement**: Mais interativo e "vivo"

**Trade-offs**:
- Mais complexo de implementar
- Requer SSE ou WebSockets
- Harder to cache
- Error handling mais delicado

## 📡 Stream Modes

LangGraph oferece 3 modos de streaming:

### 1. Stream Mode: `values`

Retorna o estado completo após cada node.

```typescript
const stream = await app.stream(input, {
  streamMode: 'values',
})

for await (const chunk of stream) {
  console.log('Full state:', chunk)
  // chunk contains entire state after each node
}
```

**Use quando**: Precisa do estado completo em cada update.

### 2. Stream Mode: `updates`

Retorna apenas as mudanças (delta) de cada node.

```typescript
const stream = await app.stream(input, {
  streamMode: 'updates',
})

for await (const chunk of stream) {
  console.log('Delta:', chunk)
  // chunk contains only the updates from the last node
}
```

**Use quando**: Quer processar apenas mudanças incrementais.

### 3. Stream Mode: `messages`

Retorna tokens individuais do LLM (streaming real).

```typescript
const stream = await app.stream(input, {
  streamMode: 'messages',
})

for await (const [message, metadata] of stream) {
  console.log('Token:', message.content)
  // Streaming token-by-token
}
```

**Use quando**: Quer streaming palavra-por-palavra (melhor UX).

## 🚀 Implementation Patterns

### Pattern 1: SSE com Next.js App Router

```typescript
// app/api/chat/stream/route.ts
import { NextRequest } from 'next/server'
import { createAgentGraph } from '@/features/chat/agents/graph'
import { HumanMessage } from '@langchain/core/messages'

export async function POST(req: NextRequest) {
  const { conversationId, content, templateId } = await req.json()

  const app = await createAgentGraph(templateId)
  const threadId = `conversation_${conversationId}`

  // Create stream
  const stream = await app.stream(
    {
      messages: [new HumanMessage(content)],
    },
    {
      configurable: {
        thread_id: threadId,
      },
      streamMode: 'values',
    }
  )

  // Convert to SSE
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const messages = chunk.messages
          const lastMessage = messages[messages.length - 1]

          if (lastMessage && lastMessage._getType() === 'ai') {
            const data = JSON.stringify({
              content: lastMessage.content,
              done: false,
            })

            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }
        }

        // Send done event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        )
        controller.close()
      } catch (error) {
        console.error('Stream error:', error)
        controller.error(error)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
```

### Pattern 2: Token-by-Token Streaming

```typescript
export async function POST(req: NextRequest) {
  const { conversationId, content, templateId } = await req.json()

  const app = await createAgentGraph(templateId)
  const threadId = `conversation_${conversationId}`

  // Use 'messages' mode for token streaming
  const stream = await app.stream(
    { messages: [new HumanMessage(content)] },
    {
      configurable: { thread_id: threadId },
      streamMode: 'messages',
    }
  )

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const [message, metadata] of stream) {
          // Send each token
          const data = JSON.stringify({
            token: message.content,
            done: false,
          })

          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        )
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

### Pattern 3: Hybrid (Streaming + Persistence)

```typescript
export async function POST(req: NextRequest) {
  const { conversationId, content } = await req.json()

  const app = await createAgentGraph(templateId)
  const threadId = `conversation_${conversationId}`

  const stream = await app.stream(
    { messages: [new HumanMessage(content)] },
    {
      configurable: { thread_id: threadId },
      streamMode: 'values',
    }
  )

  const encoder = new TextEncoder()
  let fullResponse = ''

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const messages = chunk.messages
          const lastMessage = messages[messages.length - 1]

          if (lastMessage && lastMessage._getType() === 'ai') {
            fullResponse = lastMessage.content as string

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: fullResponse, done: false })}\n\n`
              )
            )
          }
        }

        // Persist to DB after streaming completes
        await db.insert(messages).values({
          conversationId,
          role: 'assistant',
          content: fullResponse,
        })

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        )
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

## 💻 Client-Side Implementation

### Pattern 1: EventSource (Native)

```typescript
// components/ChatInterface.tsx
'use client'

import { useState } from 'react'

export function ChatInterface() {
  const [messages, setMessages] = useState<string[]>([])
  const [currentResponse, setCurrentResponse] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const sendMessage = async (content: string) => {
    setIsStreaming(true)
    setCurrentResponse('')

    const eventSource = new EventSource('/api/chat/stream', {
      // NOTE: EventSource doesn't support POST, need workaround
    })

    // Workaround: Use fetch with POST, then EventSource
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, conversationId: 1 }),
    })

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

          if (data.done) {
            setMessages((prev) => [...prev, currentResponse])
            setCurrentResponse('')
            setIsStreaming(false)
          } else {
            setCurrentResponse(data.content)
          }
        }
      }
    }
  }

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg}</div>
      ))}
      {isStreaming && <div className="typing">{currentResponse}</div>}
    </div>
  )
}
```

### Pattern 2: Fetch with ReadableStream

```typescript
'use client'

import { useState } from 'react'

export function ChatInterface() {
  const [response, setResponse] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = async (content: string) => {
    setIsLoading(true)
    setResponse('')

    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, conversationId: 1 }),
    })

    const reader = res.body?.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader!.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))

          if (data.done) {
            setIsLoading(false)
          } else {
            setResponse(data.content)
          }
        }
      }
    }
  }

  return (
    <div>
      {response && <div>{response}</div>}
      {isLoading && <div>Thinking...</div>}
    </div>
  )
}
```

### Pattern 3: Vercel AI SDK (Recomendado)

```typescript
'use client'

import { useChat } from 'ai/react'

export function ChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: '/api/chat/stream',
    })

  return (
    <div>
      <div>
        {messages.map((m) => (
          <div key={m.id}>
            <strong>{m.role}:</strong> {m.content}
          </div>
        ))}
      </div>

      {isLoading && <div>AI is thinking...</div>}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

## 🛡️ Error Handling

### Server-Side Errors

```typescript
const readable = new ReadableStream({
  async start(controller) {
    try {
      for await (const chunk of stream) {
        // Process chunk...
      }
      controller.close()
    } catch (error) {
      console.error('Stream error:', error)

      // Send error to client
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            error: 'Something went wrong',
            done: true,
          })}\n\n`
        )
      )

      controller.close()
    }
  },
})
```

### Client-Side Error Handling

```typescript
const sendMessage = async (content: string) => {
  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ content }),
    })

    if (!res.ok) {
      throw new Error('Request failed')
    }

    const reader = res.body?.getReader()
    // Process stream...
  } catch (error) {
    console.error('Error:', error)
    setError('Failed to send message. Please try again.')
  }
}
```

### Timeout Handling

```typescript
const readable = new ReadableStream({
  async start(controller) {
    const timeout = setTimeout(() => {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ error: 'Request timeout', done: true })}\n\n`
        )
      )
      controller.close()
    }, 30000) // 30 second timeout

    try {
      for await (const chunk of stream) {
        clearTimeout(timeout) // Reset timeout on each chunk
        // Process...
      }
      clearTimeout(timeout)
      controller.close()
    } catch (error) {
      clearTimeout(timeout)
      controller.error(error)
    }
  },
})
```

## 📊 Monitoring & Metrics

### Track Streaming Performance

```typescript
const readable = new ReadableStream({
  async start(controller) {
    const startTime = Date.now()
    let tokenCount = 0
    let firstTokenTime: number | null = null

    try {
      for await (const [message, metadata] of stream) {
        if (!firstTokenTime) {
          firstTokenTime = Date.now()
          console.log('Time to first token:', firstTokenTime - startTime, 'ms')
        }

        tokenCount++

        // Send token...
      }

      const totalTime = Date.now() - startTime
      const tokensPerSecond = (tokencount / totalTime) * 1000

      console.log({
        totalTime,
        tokenCount,
        tokensPerSecond,
        timeToFirstToken: firstTokenTime! - startTime,
      })

      controller.close()
    } catch (error) {
      controller.error(error)
    }
  },
})
```

## ⚠️ Common Gotchas

### 1. Buffering Issues

```typescript
// ❌ WRONG: nginx may buffer, breaking streaming
// No special headers

// ✅ CORRECT: Disable buffering
headers: {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no', // Nginx
}
```

### 2. Connection Keep-Alive

```typescript
// ✅ Importante para long-running streams
headers: {
  'Connection': 'keep-alive',
  'Keep-Alive': 'timeout=30',
}
```

### 3. Error in Mid-Stream

```typescript
// ❌ WRONG: Throw error (closes stream abruptly)
if (error) throw error

// ✅ CORRECT: Send error event
if (error) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`)
  )
  controller.close()
}
```

## 🧪 Testing

### Mock Stream

```typescript
describe('Streaming', () => {
  it('should stream response', async () => {
    const mockStream = async function* () {
      yield { messages: [new AIMessage('Hello')] }
      yield { messages: [new AIMessage('Hello world')] }
      yield { messages: [new AIMessage('Hello world!')] }
    }

    // Test stream processing...
  })
})
```

## 📚 Best Practices

1. **Always set proper headers**: SSE headers + disable buffering
2. **Handle errors gracefully**: Send error events, don't just throw
3. **Implement timeouts**: Prevent hanging connections
4. **Clean up resources**: Close streams properly
5. **Monitor performance**: Track time-to-first-token
6. **Persist after streaming**: Save final response to DB
7. **Use Vercel AI SDK**: Simplifies implementation significantly

## 🔗 Resources

- [LangGraph Streaming](https://langchain-ai.github.io/langgraph/how-tos/streaming/)
- [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [ReadableStream API](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
