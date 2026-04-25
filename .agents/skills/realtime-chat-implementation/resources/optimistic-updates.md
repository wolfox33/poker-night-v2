# Optimistic Updates

Guia completo de optimistic UI patterns para chat real-time com UX responsiva.

## 🎯 O que é Optimistic UI?

**Optimistic Updates** = Atualizar UI imediatamente, assumindo sucesso, e reverter se falhar.

**Benefícios**:
- ✅ Instant feedback (perceived performance)
- ✅ Better UX (no loading spinners)
- ✅ Feels faster
- ✅ More engaging

**Trade-offs**:
- ❌ Mais complexo
- ❌ Rollback logic necessário
- ❌ Pode confundir se reverter
- ❌ Requer unique IDs

## 📊 Basic Pattern

### Without Optimistic Updates

```typescript
const [messages, setMessages] = useState([])
const [loading, setLoading] = useState(false)

const sendMessage = async (content: string) => {
  setLoading(true)

  try {
    const response = await fetch('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ content }),
    })

    const { message } = await response.json()

    // Add message AFTER server responds
    setMessages((prev) => [...prev, message])
  } finally {
    setLoading(false)
  }
}

// UX: User waits for spinner ❌
```

### With Optimistic Updates

```typescript
const [messages, setMessages] = useState([])

const sendMessage = async (content: string) => {
  // Add message IMMEDIATELY
  const optimisticMessage = {
    id: `temp-${Date.now()}`,
    role: 'user',
    content,
    pending: true,
  }

  setMessages((prev) => [...prev, optimisticMessage])

  try {
    const response = await fetch('/api/chat/send', {
      method: 'POST',
      body: JSON.stringify({ content }),
    })

    const { messageId } = await response.json()

    // Replace temp with real ID
    setMessages((prev) =>
      prev.map((m) =>
        m.id === optimisticMessage.id ? { ...m, id: messageId, pending: false } : m
      )
    )
  } catch (error) {
    // Remove on error
    setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
  }
}

// UX: Instant feedback ✅
```

## 🔄 Implementation Patterns

### Pattern 1: Temp ID → Real ID

**Best for**: Simple messages

```typescript
interface Message {
  id: string // can be temp or real
  content: string
  pending?: boolean
}

const sendMessage = async (content: string) => {
  const tempId = `temp-${Date.now()}`

  // Add optimistically
  setMessages((prev) => [
    ...prev,
    { id: tempId, content, role: 'user', pending: true },
  ])

  try {
    const { messageId } = await api.sendMessage(content)

    // Replace temp with real
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, id: messageId, pending: false } : m))
    )
  } catch {
    // Remove on error
    setMessages((prev) => prev.filter((m) => m.id !== tempId))
    showError('Failed to send message')
  }
}
```

### Pattern 2: Pending State

**Best for**: Show status indicators

```typescript
interface Message {
  id: string
  content: string
  status: 'pending' | 'sent' | 'error'
}

const sendMessage = async (content: string) => {
  const tempId = `temp-${Date.now()}`

  setMessages((prev) => [
    ...prev,
    { id: tempId, content, status: 'pending' },
  ])

  try {
    const { messageId } = await api.sendMessage(content)

    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId ? { ...m, id: messageId, status: 'sent' } : m
      )
    )
  } catch {
    // Mark as error (don't remove)
    setMessages((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, status: 'error' } : m))
    )
  }
}

// UI
{message.status === 'pending' && <Spinner />}
{message.status === 'error' && <RetryButton />}
{message.status === 'sent' && <CheckMark />}
```

### Pattern 3: Retry on Error

**Best for**: Network resilience

```typescript
interface Message {
  id: string
  content: string
  status: 'pending' | 'sent' | 'error'
  retryCount?: number
}

const sendMessage = async (content: string, maxRetries = 3) => {
  const tempId = `temp-${Date.now()}`

  setMessages((prev) => [
    ...prev,
    { id: tempId, content, status: 'pending', retryCount: 0 },
  ])

  const attempt = async (retryCount: number): Promise<void> => {
    try {
      const { messageId } = await api.sendMessage(content)

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: messageId, status: 'sent' } : m
        )
      )
    } catch (error) {
      if (retryCount < maxRetries) {
        // Retry with backoff
        const delay = Math.min(1000 * 2 ** retryCount, 5000)
        await new Promise((r) => setTimeout(r, delay))

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, retryCount: retryCount + 1 } : m
          )
        )

        return attempt(retryCount + 1)
      } else {
        // Max retries exceeded
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'error' } : m))
        )
      }
    }
  }

  await attempt(0)
}

// UI
{message.retryCount > 0 && <span>Retrying ({message.retryCount})...</span>}
```

## 🎨 UI Patterns

### Visual Indicators

```typescript
// Message component
function MessageBubble({ message }: { message: Message }) {
  return (
    <div
      className={cn(
        'rounded-lg p-3',
        message.status === 'pending' && 'opacity-60',
        message.status === 'error' && 'border-red-500'
      )}
    >
      {message.content}

      {/* Status indicator */}
      <div className="mt-1 text-xs text-gray-500">
        {message.status === 'pending' && (
          <>
            <Spinner className="inline w-3 h-3" />
            <span className="ml-1">Sending...</span>
          </>
        )}
        {message.status === 'sent' && <CheckIcon className="w-4 h-4 text-green-500" />}
        {message.status === 'error' && (
          <>
            <AlertIcon className="w-4 h-4 text-red-500" />
            <button onClick={() => retry(message.id)}>Retry</button>
          </>
        )}
      </div>
    </div>
  )
}
```

### Skeleton Loading

```typescript
// Show skeleton for AI response while streaming
{isStreaming && !streamingContent && (
  <div className="bg-gray-200 rounded-lg p-3 animate-pulse">
    <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
    <div className="h-4 bg-gray-300 rounded w-1/2"></div>
  </div>
)}
```

### Typing Indicator

```typescript
{isTyping && (
  <div className="flex items-center gap-1 p-3">
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
  </div>
)}
```

## 🚀 Streaming + Optimistic

Combine optimistic updates with streaming responses.

```typescript
const useChatStream = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')

  const sendMessage = async (content: string) => {
    // 1. Add user message optimistically
    const userTempId = `temp-user-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: userTempId, role: 'user', content, status: 'pending' },
    ])

    try {
      // 2. Send to server
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content }),
      })

      // 3. Mark user message as sent
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userTempId ? { ...m, status: 'sent' } : m
        )
      )

      // 4. Stream AI response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader!.read()
        if (done) break

        const chunk = decoder.decode(value)
        // Process SSE...

        if (data.done) {
          // 5. Add final AI message
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: data.content,
              status: 'sent',
            },
          ])
          setStreamingContent('')
        } else {
          // Update streaming preview
          setStreamingContent(data.content)
        }
      }
    } catch (error) {
      // 6. Mark user message as error
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userTempId ? { ...m, status: 'error' } : m
        )
      )
    }
  }

  return { messages, streamingContent, sendMessage }
}
```

## ⚡ Performance Optimization

### Avoid Re-renders

```typescript
// ❌ WRONG: Re-render entire list
{messages.map((m) => <Message key={m.id} message={m} />)}

// ✅ CORRECT: Memoize components
const MemoizedMessage = memo(Message)

{messages.map((m) => <MemoizedMessage key={m.id} message={m} />)}
```

### Virtual Scrolling

For long message lists:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function ChatMessages({ messages }: { messages: Message[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  })

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <Message message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## 🧪 Testing

### Test Optimistic Updates

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatInterface } from './ChatInterface'

test('shows message optimistically', async () => {
  render(<ChatInterface />)

  const input = screen.getByPlaceholderText('Type a message...')
  const button = screen.getByText('Send')

  fireEvent.change(input, { target: { value: 'Hello' } })
  fireEvent.click(button)

  // Message appears immediately
  expect(screen.getByText('Hello')).toBeInTheDocument()
  expect(screen.getByText('Sending...')).toBeInTheDocument()

  // Wait for confirmation
  await waitFor(() => {
    expect(screen.queryByText('Sending...')).not.toBeInTheDocument()
  })
})

test('removes message on error', async () => {
  // Mock failed request
  global.fetch = jest.fn(() => Promise.reject('Network error'))

  render(<ChatInterface />)

  fireEvent.change(input, { target: { value: 'Hello' } })
  fireEvent.click(button)

  // Message appears
  expect(screen.getByText('Hello')).toBeInTheDocument()

  // Wait for error
  await waitFor(() => {
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
    expect(screen.getByText(/error/i)).toBeInTheDocument()
  })
})
```

## ⚠️ Common Gotchas

### 1. ID Collisions

```typescript
// ❌ WRONG: Can collide
const tempId = `temp-${Math.random()}`

// ✅ CORRECT: Guaranteed unique
const tempId = `temp-${Date.now()}-${Math.random()}`
```

### 2. Not Handling Duplicates

```typescript
// ❌ WRONG: Can add duplicate
setMessages((prev) => [...prev, newMessage])

// ✅ CORRECT: Check for duplicates
setMessages((prev) => {
  const exists = prev.some((m) => m.id === newMessage.id)
  return exists ? prev : [...prev, newMessage]
})
```

### 3. Forgetting to Clear Streaming

```typescript
// ❌ WRONG: Streaming content persists
if (data.done) {
  setMessages((prev) => [...prev, aiMessage])
}

// ✅ CORRECT: Clear streaming content
if (data.done) {
  setMessages((prev) => [...prev, aiMessage])
  setStreamingContent('') // Important!
}
```

## 📚 Best Practices

1. **Use unique temp IDs** - Prevent collisions
2. **Show status indicators** - Pending, sent, error
3. **Implement retry** - Network resilience
4. **Debounce updates** - performance
5. **Memoize components** - Avoid re-renders
6. **Virtual scrolling** - For long lists
7. **Test edge cases** - Network errors, timeouts
8. **Clear state** - Remove temp data after confirm

## 🔗 Resources

- [React Optimistic UI](https://react.dev/reference/react-dom/hooks/useOptimistic)
- [TanStack Query Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [SWR Optimistic UI](https://swr.vercel.app/docs/mutation#optimistic-updates)
