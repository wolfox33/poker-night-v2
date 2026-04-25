# SSE Patterns

Padrões de implementação de Server-Sent Events para chat real-time.

## 🎯 O que é SSE?

**Server-Sent Events** = Streaming unidirecional HTTP (server → client).

**Características**:
- Unidirecional (server → client apenas)
- Text-based protocol
- Automatic reconnection
- Event IDs para resume
- Built into browsers
- Works over HTTP

**vs WebSockets**: SSE é mais simples, mas apenas unidirecional.

## 📡 Protocol Basics

### SSE Message Format

```
data: This is a message\n\n

data: Another message\n\n

event: custom\ndata: Custom event\n\n

id: 123\ndata: Message with ID\n\n
```

**Fields**:
- `data:` - Message content (required)
- `event:` - Event type (optional, default: `message`)
- `id:` - Event ID (optional, for resume)
- `retry:` - Reconnection time in ms (optional)

### Multiple Lines

```
data: First line\ndata: Second line\n\n
```

### JSON Data

```
data: {"message": "Hello", "user": "Alice"}\n\n
```

## 🚀 Implementation Patterns

### Pattern 1: Basic SSE Endpoint

**Server (Next.js)**:
```typescript
// app/api/sse/route.ts
export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial message
      controller.enqueue(encoder.encode('data: Connected\n\n'))

      // Send messages every second
      const interval = setInterval(() => {
        controller.enqueue(
          encoder.encode(`data: ${new Date().toISOString()}\n\n`)
        )
      }, 1000)

      // Cleanup on close
      setTimeout(() => {
        clearInterval(interval)
        controller.close()
      }, 10000)
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
const eventSource = new EventSource('/api/sse')

eventSource.onmessage = (event) => {
  console.log('Message:', event.data)
}

eventSource.onerror = (error) => {
  console.error('Error:', error)
  eventSource.close()
}

// Cleanup
eventSource.close()
```

### Pattern 2: Chat Streaming

**Server**:
```typescript
// app/api/chat/stream/route.ts
export async function POST(req: NextRequest) {
  const { message, conversationId } = await req.json()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Get AI response stream
        const aiStream = await getAIStream(message)

        let fullResponse = ''

        for await (const chunk of aiStream) {
          fullResponse += chunk

          // Send chunk
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                content: fullResponse,
                done: false,
              })}\n\n`
            )
          )
        }

        // Persist message
        await saveMessage(conversationId, fullResponse)

        // Send completion
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              content: fullResponse,
              done: true,
            })}\n\n`
          )
        )

        controller.close()
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: error.message, done: true })}\n\n`
          )
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

**Client (Fetch API)**:
```typescript
async function sendMessage(message: string) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId: 1 }),
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
          console.log('Stream complete:', data.content)
        } else {
          console.log('Streaming:', data.content)
        }
      }
    }
  }
}
```

### Pattern 3: Event Types

Multiple event types in same stream.

**Server**:
```typescript
const stream = new ReadableStream({
  start(controller) {
    // Token event
    controller.enqueue(
      encoder.encode(`event: token\ndata: ${JSON.stringify({ token: 'Hello' })}\n\n`)
    )

    // Metadata event
    controller.enqueue(
      encoder.encode(
        `event: metadata\ndata: ${JSON.stringify({ tokens: 100, cost: 0.01 })}\n\n`
      )
    )

    // Done event
    controller.enqueue(encoder.encode(`event: done\ndata: complete\n\n`))

    controller.close()
  },
})
```

**Client**:
```typescript
const eventSource = new EventSource('/api/stream')

// Listen to specific events
eventSource.addEventListener('token', (event) => {
  const data = JSON.parse(event.data)
  console.log('Token:', data.token)
})

eventSource.addEventListener('metadata', (event) => {
  const data = JSON.parse(event.data)
  console.log('Metadata:', data)
})

eventSource.addEventListener('done', (event) => {
  console.log('Stream done:', event.data)
  eventSource.close()
})
```

### Pattern 4: Event IDs (Resume)

Use event IDs para resumir stream após disconnect.

**Server**:
```typescript
const stream = new ReadableStream({
  start(controller) {
    let eventId = 0

    const interval = setInterval(() => {
      eventId++
      controller.enqueue(
        encoder.encode(
          `id: ${eventId}\ndata: Message ${eventId}\n\n`
        )
      )

      if (eventId >= 10) {
        clearInterval(interval)
        controller.close()
      }
    }, 1000)
  },
})
```

**Client (Auto-resume)**:
```typescript
const eventSource = new EventSource('/api/stream')

eventSource.onmessage = (event) => {
  console.log('ID:', event.lastEventId, 'Data:', event.data)
}

// On reconnect, browser sends Last-Event-ID header
// Server can use this to resume from last event
```

**Server (Resume from ID)**:
```typescript
export async function GET(req: NextRequest) {
  const lastEventId = req.headers.get('Last-Event-ID')
  const startFrom = lastEventId ? parseInt(lastEventId) : 0

  const stream = new ReadableStream({
    start(controller) {
      for (let i = startFrom + 1; i <= 10; i++) {
        controller.enqueue(
          encoder.encode(`id: ${i}\ndata: Message ${i}\n\n`)
        )
      }
      controller.close()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
```

## 🔄 Reconnection

### Auto Reconnection

SSE automatically reconnects on disconnect.

**Server (Set Retry)**:
```typescript
controller.enqueue(encoder.encode('retry: 5000\n\n')) // 5s retry
```

**Client (Default)**:
```typescript
const eventSource = new EventSource('/api/stream')

eventSource.onerror = (error) => {
  // Browser will auto-reconnect
  console.log('Connection lost, reconnecting...')
}
```

### Manual Reconnection

```typescript
function createEventSource(url: string, maxRetries = 5) {
  let retries = 0
  let eventSource: EventSource

  const connect = () => {
    eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
      console.log('Message:', event.data)
      retries = 0 // Reset on successful message
    }

    eventSource.onerror = (error) => {
      console.error('Error:', error)
      eventSource.close()

      if (retries < maxRetries) {
        retries++
        const delay = Math.min(1000 * 2 ** retries, 30000)
        console.log(`Reconnecting in ${delay}ms...`)
        setTimeout(connect, delay)
      } else {
        console.error('Max retries reached')
      }
    }
  }

  connect()

  return {
    close: () => eventSource.close(),
  }
}

const sse = createEventSource('/api/stream')
```

## 🛡️ Error Handling

### Server Errors

```typescript
const stream = new ReadableStream({
  async start(controller) {
    try {
      for await (const chunk of dataStream) {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
      }
    } catch (error) {
      // Send error event
      controller.enqueue(
        encoder.encode(
          `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`
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
const eventSource = new EventSource('/api/stream')

eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data)
  console.error('Server error:', data.message)
  eventSource.close()
})

eventSource.onerror = (error) => {
  console.error('Connection error:', error)
  // Browser will auto-reconnect unless we close
}
```

## ⚡ Performance

### Compression

```typescript
// Next.js automatically compresses responses
// For manual compression:
import { gzip } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)

// Compress data before sending
const compressed = await gzipAsync(Buffer.from(data))
controller.enqueue(compressed)
```

### Batch Updates

```typescript
let buffer: string[] = []
let lastFlush = Date.now()
const FLUSH_INTERVAL = 100 // ms
const BATCH_SIZE = 10

for await (const token of stream) {
  buffer.push(token)

  const now = Date.now()
  const shouldFlush =
    buffer.length >= BATCH_SIZE || now - lastFlush > FLUSH_INTERVAL

  if (shouldFlush) {
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ tokens: buffer })}\n\n`)
    )
    buffer = []
    lastFlush = now
  }
}

// Flush remaining
if (buffer.length > 0) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ tokens: buffer })}\n\n`)
  )
}
```

## 🧪 Testing

### Mock SSE Server

```typescript
// lib/test-utils/mock-sse-server.ts
export function createMockSSEServer() {
  const messages = ['Hello', 'World', 'Done']

  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      messages.forEach((msg, i) => {
        setTimeout(() => {
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
          if (i === messages.length - 1) {
            controller.close()
          }
        }, i * 100)
      })
    },
  })
}
```

### Test Client

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { useSSE } from './use-sse'

test('receives SSE messages', async () => {
  const { result } = renderHook(() => useSSE('/api/stream'))

  await waitFor(() => {
    expect(result.current.messages).toHaveLength(3)
  })

  expect(result.current.messages).toEqual(['Hello', 'World', 'Done'])
})
```

## ⚠️ Common Gotchas

### 1. Connection Limit

**Problem**: Browsers limit SSE connections (6 per domain in HTTP/1.1).

**Solution**: Use HTTP/2 or close unused connections.

```typescript
// Close when component unmounts
useEffect(() => {
  const sse = new EventSource('/api/stream')

  return () => {
    sse.close() // Important!
  }
}, [])
```

### 2. CORS

```typescript
// app/api/sse/route.ts
export async function GET() {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}
```

### 3. Proxy Buffering

```typescript
// Disable nginx buffering
headers: {
  'X-Accel-Buffering': 'no',
  'Cache-Control': 'no-cache, no-transform',
}
```

## 📚 Best Practices

1. **Always set proper headers** (`text/event-stream`, `no-cache`)
2. **Close connections** when done (client + server)
3. **Handle errors** gracefully (send error events)
4. **Use event IDs** for resumable streams
5. **Batch updates** for performance
6. **Test reconnection** scenarios
7. **Monitor connection count** (avoid hitting limits)
8. **Disable buffering** (nginx, cloudflare)

## 🔗 Resources

- [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
