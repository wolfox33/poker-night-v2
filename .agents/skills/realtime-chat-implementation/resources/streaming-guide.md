# Streaming Guide

Guia completo de implementação de streaming de mensagens AI em chat real-time.

## 🎯 Por que Streaming?

**Benefícios**:
- **Better UX**: Usuário vê resposta aparecer
- **Faster perceived performance**: Parece mais rápido
- **Early interrupt**: User pode parar se incorreto
- **Engagement**: Mais interativo

**Trade-offs**:
- Mais complexo
- Requer SSE/WebSockets
- Error handling harder
- Can't easily cache

## 🚀 Implementation Options

### Option 1: Vercel AI SDK (Recomendado)

**Melhor para**: Most use cases

```bash
npm install ai
```

**Server**:
```typescript
// app/api/chat/route.ts
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = await streamText({
    model: openai('gpt-4'),
    messages,
  })

  return result.toAIStreamResponse()
}
```

**Client**:
```typescript
'use client'

import { useChat } from 'ai/react'

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  )
}
```

**Vantagens**:
- ✅ Tudo integrado (streaming, persistence, UI)
- ✅ Optimistic updates automático
- ✅ Error handling built-in
- ✅ Works com LangChain/LangGraph

### Option 2: Manual SSE

**Melhor para**: Custom implementation, mais controle

**Server**:
```typescript
export async function POST(req: NextRequest) {
  const { message } = await req.json()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Simulate AI streaming
      const response = 'This is a streaming response'
      const words = response.split(' ')

      for (const word of words) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ token: word })}\n\n`)
        )
        await new Promise((r) => setTimeout(r, 100))
      }

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
      )
      controller.close()
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

**Client**:
```typescript
const sendMessage = async (message: string) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
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
          console.log('Stream complete')
        } else {
          console.log('Token:', data.token)
        }
      }
    }
  }
}
```

## 📊 Streaming Patterns

### Pattern 1: Token-by-Token

Stream cada token individual (palavra).

**When**: Quer mostrar progresso palavra-por-palavra

```typescript
for await (const token of aiStream) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
  )
}
```

**Client**:
```typescript
const [response, setResponse] = useState('')

// On each token
setResponse((prev) => prev + token + ' ')
```

### Pattern 2: Incremental Content

Stream conteúdo acumulado (todo o texto até agora).

**When**: Quer garantir texto completo sempre visível

```typescript
let fullContent = ''

for await (const token of aiStream) {
  fullContent += token
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ content: fullContent })}\n\n`)
  )
}
```

**Client**:
```typescript
const [response, setResponse] = useState('')

// On each chunk
setResponse(chunk.content) // Replace, not append
```

### Pattern 3: Hybrid (Recommended)

Stream tokens + metadata + final content.

```typescript
let fullContent = ''
let tokenCount = 0

for await (const token of aiStream) {
  fullContent += token
  tokenCount++

  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        token,
        content: fullContent,
        tokenCount,
        done: false,
      })}\n\n`
    )
  )
}

// Final event
controller.enqueue(
  encoder.encode(
    `data: ${JSON.stringify({
      content: fullContent,
      tokenCount,
      done: true,
    })}\n\n`
  )
)
```

## 🔄 LangGraph Integration

### Stream LangGraph Output

```typescript
import { createAgentGraph } from '@/features/chat/agents/graph'

export async function POST(req: NextRequest) {
  const { message, conversationId } = await req.json()

  const app = await createAgentGraph(templateId)
  const threadId = `conversation_${conversationId}`

  // Stream with 'values' mode
  const stream = await app.stream(
    { messages: [new HumanMessage(message)] },
    {
      configurable: { thread_id: threadId },
      streamMode: 'values', // or 'messages' for tokens
    }
  )

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const messages = chunk.messages
          const lastMessage = messages[messages.length - 1]

          if (lastMessage?._getType() === 'ai') {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  content: lastMessage.content,
                  done: false,
                })}\n\n`
              )
            )
          }
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
      Connection: 'keep-alive',
    },
  })
}
```

## ⚡ Performance Optimization

### Batch Tokens

Instead of sending every single token, batch them.

```typescript
let buffer = ''
let lastFlush = Date.now()
const FLUSH_INTERVAL = 50 // ms

for await (const token of stream) {
  buffer += token

  const now = Date.now()
  if (now - lastFlush > FLUSH_INTERVAL) {
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`)
    )
    lastFlush = now
  }
}

// Flush remaining
if (buffer) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ content: buffer })}\n\n`)
  )
}
```

### Debounce UI Updates

```typescript
import { useMemo } from 'react'
import debounce from 'lodash/debounce'

const debouncedSetResponse = useMemo(
  () => debounce((content: string) => setResponse(content), 50),
  []
)

// On chunk received
debouncedSetResponse(chunk.content)
```

## 🛡️ Error Handling

### Server Errors

```typescript
const readable = new ReadableStream({
  async start(controller) {
    try {
      for await (const chunk of stream) {
        // Process...
      }
    } catch (error) {
      console.error('Stream error:', error)

      // Send error event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            error: 'Stream failed',
            done: true,
          })}\n\n`
        )
      )
    } finally {
      controller.close()
    }
  },
})
```

### Client Errors

```typescript
try {
  const reader = response.body?.getReader()

  while (true) {
    const { done, value } = await reader!.read()
    if (done) break

    // Process chunk...
  }
} catch (error) {
  console.error('Read error:', error)
  setError('Failed to receive response')
}
```

### Timeout

```typescript
const TIMEOUT = 30000 // 30s

const timeoutId = setTimeout(() => {
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({ error: 'Timeout', done: true })}\n\n`
    )
  )
  controller.close()
}, TIMEOUT)

try {
  for await (const chunk of stream) {
    clearTimeout(timeoutId) // Reset on each chunk
    // Process...
  }
} finally {
  clearTimeout(timeoutId)
}
```

## 📊 Monitoring

### Track Performance

```typescript
const startTime = Date.now()
let firstTokenTime: number | null = null
let tokenCount = 0

for await (const token of stream) {
  if (!firstTokenTime) {
    firstTokenTime = Date.now()
    console.log('Time to first token:', firstTokenTime - startTime, 'ms')
  }

  tokenCount++
}

const totalTime = Date.now() - startTime
console.log({
  totalTime,
  tokenCount,
  tokensPerSecond: (tokenCount / totalTime) * 1000,
  timeToFirstToken: firstTokenTime! - startTime,
})
```

## 🧪 Testing

### Mock Stream

```typescript
async function* mockStream() {
  const response = 'This is a test response'
  const words = response.split(' ')

  for (const word of words) {
    yield word
    await new Promise((r) => setTimeout(r, 100))
  }
}

// Use in tests
for await (const token of mockStream()) {
  console.log(token)
}
```

### Test Component

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { ChatInterface } from './ChatInterface'

test('streams response', async () => {
  render(<ChatInterface />)

  const input = screen.getByPlaceholderText('Type a message...')
  const button = screen.getByText('Send')

  fireEvent.change(input, { target: { value: 'Hello' } })
  fireEvent.click(button)

  await waitFor(() => {
    expect(screen.getByText(/streaming/i)).toBeInTheDocument()
  })

  await waitFor(
    () => {
      expect(screen.getByText(/full response/i)).toBeInTheDocument()
    },
    { timeout: 5000 }
  )
})
```

## 📚 Best Practices

1. **Always send `done` event** - Client sabe quando terminou
2. **Flush regularly** - Batch tokens for performance
3. **Handle errors gracefully** - Send error events
4. **Implement timeout** - Don't hang forever
5. **Monitor performance** - Track time-to-first-token
6. **Persist after streaming** - Save to DB when complete
7. **Use proper headers** - `text/event-stream`, `no-cache`
8. **Disable buffering** - nginx, cloudflare, etc.

## ⚠️ Common Gotchas

### 1. Buffering

```typescript
// ❌ WRONG: May be buffered by proxy
headers: {
  'Content-Type': 'text/event-stream',
}

// ✅ CORRECT: Disable buffering
headers: {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no', // nginx
}
```

### 2. Not Closing Stream

```typescript
// ❌ WRONG: Stream never closes
for await (const chunk of stream) {
  controller.enqueue(chunk)
}
// Missing controller.close()

// ✅ CORRECT: Always close
try {
  for await (const chunk of stream) {
    controller.enqueue(chunk)
  }
} finally {
  controller.close()
}
```

### 3. Missing Error Event

```typescript
// ❌ WRONG: Client hangs on error
if (error) {
  throw error
}

// ✅ CORRECT: Send error event
if (error) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`)
  )
  controller.close()
}
```

## 🔗 Resources

- [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [LangChain Streaming](https://js.langchain.com/docs/expression_language/streaming)
- [ReadableStream API](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
