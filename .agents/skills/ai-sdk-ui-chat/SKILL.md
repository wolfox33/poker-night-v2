---
name: ai-sdk-ui-chat
description: Padrões de implementação de interface de chat usando Vercel AI SDK UI (@ai-sdk/react) com useChat, streaming, persistência, tools, error handling e integração segura com Next.js App Router, Better Auth e sistema de créditos.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 6
  tags: [ai-sdk, useChat, streaming, chat-ui, react, nextjs, vercel-ai]
  compatible_with: [antigravity, windsurf, opencode]
---

# AI SDK UI for Chat Applications

Guia completo para construir interfaces de chat usando Vercel AI SDK UI (`@ai-sdk/react`), alinhado com arquitetura vertical-slice e boas práticas de segurança.

## 🎯 Objetivo

Fornecer:
- **useChat** hook para streaming de mensagens em tempo real
- **useCompletion** para text completions
- **useObject** para streaming de objetos JSON
- **Persistência** de mensagens com Drizzle + PostgreSQL
- **Segurança** integrada (auth, validation, ownership, credits)
- **Error handling** robusto com retry e fallback
- **Tool calling** com type safety

## ⚡ Use when

- Construir interface de chat com AI streaming
- Precisar de gerenciamento de estado de chat (messages, status, error)
- Integrar streaming de AI com Next.js App Router
- Implementar tool calling na UI
- Precisar de persistência de mensagens
- Substituir implementação manual de SSE por abstração robusta

## 🚫 Do not use

- Para operações one-shot sem streaming (usar `generateText` diretamente)
- Para backends não-JavaScript (usar SSE manual)
- Para chat sem AI (usar WebSockets direto)

## 📦 Stack

```bash
bun add ai @ai-sdk/react @ai-sdk/openai
# ou para Anthropic:
bun add ai @ai-sdk/react @ai-sdk/anthropic
```

| Pacote | Versão | Propósito |
|--------|--------|-----------|
| `ai` | `6.0+` | Core SDK (streamText, convertToModelMessages, UIMessage) |
| `@ai-sdk/react` | `1.0+` | React hooks (useChat, useCompletion, useObject) |
| `@ai-sdk/openai` | `1.0+` | Provider OpenAI/compatíveis |
| `@ai-sdk/anthropic` | `1.0+` | Provider Anthropic |

## Safety

- **SEMPRE** autenticar no Route Handler antes de chamar `streamText`
- **SEMPRE** validar messages no server com `validateUIMessages` quando usar tools/metadata
- **NUNCA** confiar em dados do client (userId, conversationId) — extrair do session
- **SEMPRE** verificar ownership da conversa antes de processar
- **VERIFICAR** créditos antes de iniciar streaming
- **DEBITAR** créditos somente após streaming completo com sucesso
- **USAR** `consumeStream()` para garantir persistência mesmo com disconnect
- **NUNCA** expor error.message interno ao client — usar mensagens genéricas
- **IMPLEMENTAR** rate limiting em endpoints de chat
- **SANITIZAR** output de AI antes de renderizar (especialmente com dangerouslySetInnerHTML)
- **VALIDAR** input do usuário com Zod antes de processar

## 📚 Quick Reference

### Client Component (useChat)

```typescript
// features/chat/components/ChatInterface.tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState } from 'react'

interface ChatInterfaceProps {
  chatId: string
  initialMessages?: UIMessage[]
}

export function ChatInterface({ chatId, initialMessages }: ChatInterfaceProps) {
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    chatId,
    initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      credentials: 'include', // Enviar cookies de auth
    }),
    experimental_throttle: 50, // Throttle UI updates
    onError: (error) => {
      // ⚠️ Mostrar mensagem genérica, nunca error.message do server
      console.error('Chat error:', error.message)
    },
    onFinish: ({ message }) => {
      // Callback após resposta completa
    },
  })
  const [input, setInput] = useState('')

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col">
            <span className="text-sm font-medium">
              {message.role === 'user' ? 'Você' : 'AI'}
            </span>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return <p key={index}>{part.text}</p>
              }
              if (part.type === 'reasoning') {
                return (
                  <details key={index} className="text-sm text-muted-foreground">
                    <summary>Raciocínio</summary>
                    <pre>{part.text}</pre>
                  </details>
                )
              }
              return null
            })}
          </div>
        ))}
      </div>

      {/* Status indicators */}
      {status === 'submitted' && <div className="p-2 text-sm">Pensando...</div>}
      {status === 'streaming' && (
        <button onClick={() => stop()} className="text-sm text-red-500">
          Parar
        </button>
      )}

      {/* Error state */}
      {error && (
        <div className="p-2 bg-destructive/10 text-destructive text-sm">
          Algo deu errado.
          <button onClick={() => regenerate()} className="ml-2 underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim() && status === 'ready') {
            sendMessage({ text: input })
            setInput('')
          }
        }}
        className="flex gap-2 p-4 border-t"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Digite sua mensagem..."
          className="flex-1 px-3 py-2 border rounded-md"
        />
        <button
          type="submit"
          disabled={status !== 'ready' || !input.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
```

### Route Handler (Server)

```typescript
// app/api/chat/route.ts (thin wrapper — delega para feature service)
import { NextRequest } from 'next/server'
import { auth } from '@/core/auth'
import { handleChatStream } from '@/features/chat/service/handle-chat-stream'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  // 1. Autenticar
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Delegar para service
  return handleChatStream(req, session)
}
```

### Feature Service

```typescript
// features/chat/service/handle-chat-stream.ts
import {
  convertToModelMessages,
  streamText,
  UIMessage,
  validateUIMessages,
} from 'ai'
import { z } from 'zod'
import { db } from '@/core/db'
import { conversations, messages as messagesTable } from '@/core/db/schema'
import { eq, and } from 'drizzle-orm'
import { hasCredits, debitCredits } from '@/features/credits/service/debit-credits'
import { rateLimit } from '@/core/rate-limit'
import { getModel } from '@/features/chat/service/get-model'

const chatRequestSchema = z.object({
  messages: z.array(z.any()).min(1),
  chatId: z.string().min(1).max(100),
})

export async function handleChatStream(req: Request, session: any) {
  // 1. Validar input
  const body = await req.json()
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response('Invalid input', { status: 400 })
  }

  const { messages, chatId } = parsed.data

  // 2. Rate limiting
  const limit = rateLimit(`chat:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 20,
  })
  if (!limit.success) {
    return new Response('Too many requests', { status: 429 })
  }

  // 3. Verificar ownership da conversa (prevenir IDOR)
  const conversation = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, chatId),
        eq(conversations.userId, session.user.id)
      )
    )
    .limit(1)

  if (!conversation[0]) {
    return new Response('Conversation not found', { status: 404 })
  }

  // 4. Verificar créditos (sem debitar ainda)
  const hasBal = await hasCredits(session.user.id, 1)
  if (!hasBal) {
    return new Response('Insufficient credits', { status: 402 })
  }

  // 5. Validar messages (importante para tools/metadata)
  const validatedMessages = await validateUIMessages({
    messages: messages as UIMessage[],
  })

  // 6. Stream com AI SDK
  const model = getModel(conversation[0].templateId)

  const result = streamText({
    model,
    system: conversation[0].systemPrompt || 'You are a helpful assistant.',
    messages: await convertToModelMessages(validatedMessages),
  })

  // 7. Consumir stream para garantir persistência mesmo com disconnect
  result.consumeStream()

  // 8. Retornar stream com persistência
  return result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    onFinish: async ({ messages: allMessages }) => {
      // ✅ Debitar crédito SOMENTE após sucesso
      await debitCredits(session.user.id, 1, 'message_sent', {
        conversationId: chatId,
      })

      // ✅ Persistir mensagens
      await saveMessages(chatId, allMessages)
    },
    // ⚠️ Nunca expor erro interno ao client
    onError: (error) => {
      console.error('Stream error:', error)
      return 'An error occurred.'
    },
  })
}
```

## 🚀 Patterns

### Pattern 1: Enviar apenas última mensagem (otimização)

```typescript
// features/chat/components/ChatInterface.tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

export function ChatInterface({ chatId, initialMessages }) {
  const chat = useChat({
    chatId,
    initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      credentials: 'include',
      // Enviar apenas a última mensagem (server carrega histórico)
      prepareSendMessagesRequest({ messages, id }) {
        return {
          body: {
            message: messages[messages.length - 1],
            chatId: id,
          },
        }
      },
    }),
  })

  // ... render
}
```

```typescript
// features/chat/service/handle-chat-stream.ts (variante last-message)
import {
  convertToModelMessages,
  streamText,
  UIMessage,
  validateUIMessages,
} from 'ai'

export async function handleChatStreamLastMessage(req: Request, session: any) {
  const { message, chatId } = await req.json()

  // ... auth, ownership, rate limit checks ...

  // Carregar mensagens anteriores do DB
  const previousMessages = await loadMessages(chatId)

  // Validar todas as mensagens
  const validatedMessages = await validateUIMessages({
    messages: [...previousMessages, message],
  })

  const result = streamText({
    model,
    messages: await convertToModelMessages(validatedMessages),
  })

  result.consumeStream()

  return result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    onFinish: async ({ messages }) => {
      await debitCredits(session.user.id, 1, 'message_sent', { conversationId: chatId })
      await saveMessages(chatId, messages)
    },
  })
}
```

### Pattern 2: Tool Calling

```typescript
// app/api/chat/route.ts (com tools)
import { convertToModelMessages, streamText, UIMessage } from 'ai'
import { auth } from '@/core/auth'
import { z } from 'zod'

export const maxDuration = 30

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
    tools: {
      // Server-side tool (executa automaticamente no server)
      searchKnowledge: {
        description: 'Search the knowledge base for relevant information',
        inputSchema: z.object({
          query: z.string().describe('Search query'),
        }),
        execute: async ({ query }) => {
          // ✅ Usar userId do session, não do client
          return searchKnowledgeBase(query, session.user.id)
        },
      },
      // Client-side tool (sem execute — UI renderiza)
      askConfirmation: {
        description: 'Ask the user for confirmation',
        inputSchema: z.object({
          message: z.string().describe('Confirmation message'),
        }),
      },
    },
  })

  return result.toUIMessageStreamResponse()
}
```

```typescript
// features/chat/components/ChatWithTools.tsx
'use client'

import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'
import { useState } from 'react'

export function ChatWithTools({ chatId }) {
  const {
    messages,
    sendMessage,
    addToolOutput,
    status,
  } = useChat({
    chatId,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      credentials: 'include',
    }),
    // Auto-submit quando todos os tool results estiverem disponíveis
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Executar client-side tools automaticamente
    onToolCall({ toolCall }) {
      if (toolCall.dynamic) return

      if (toolCall.toolName === 'getLocation') {
        addToolOutput({ toolCallId: toolCall.toolCallId, output: 'São Paulo' })
      }
    },
  })
  const [input, setInput] = useState('')

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <p key={index}>{part.text}</p>
            }
            // Renderizar tool calls client-side
            if (part.type === 'tool-askConfirmation') {
              return (
                <div key={index} className="border p-4 rounded">
                  <p>{part.toolInvocation.input.message}</p>
                  {'output' in part.toolInvocation ? (
                    <span>{part.toolInvocation.output}</span>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() =>
                          addToolOutput({
                            toolCallId: part.toolInvocation.toolCallId,
                            output: 'confirmed',
                          })
                        }
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() =>
                          addToolOutput({
                            toolCallId: part.toolInvocation.toolCallId,
                            output: 'denied',
                          })
                        }
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )
            }
            return null
          })}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim()) {
            sendMessage({ text: input })
            setInput('')
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  )
}
```

### Pattern 3: Usage Tracking com Metadata

```typescript
// features/chat/service/handle-chat-stream.ts (com usage tracking)
import { LanguageModelUsage } from 'ai'

type ChatMetadata = {
  totalUsage: LanguageModelUsage
}

export type ChatUIMessage = UIMessage<ChatMetadata>

// No route handler:
return result.toUIMessageStreamResponse({
  originalMessages: validatedMessages,
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return { totalUsage: part.totalUsage }
    }
  },
  onFinish: async ({ messages }) => {
    // Persistir usage para billing
    const lastMessage = messages[messages.length - 1]
    const usage = lastMessage.metadata?.totalUsage
    if (usage) {
      await db.insert(usageLog).values({
        userId: session.user.id,
        conversationId: chatId,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      })
    }

    await debitCredits(session.user.id, 1, 'message_sent', {
      conversationId: chatId,
    })
    await saveMessages(chatId, messages)
  },
})
```

```typescript
// features/chat/components/ChatInterface.tsx (exibir usage)
'use client'

import { useChat } from '@ai-sdk/react'
import type { ChatUIMessage } from '@/features/chat/service/handle-chat-stream'

const { messages } = useChat<ChatUIMessage>({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    credentials: 'include',
  }),
})

// Renderizar usage
{messages.map((m) => (
  <div key={m.id}>
    {/* ... message content ... */}
    {m.metadata?.totalUsage && (
      <span className="text-xs text-muted-foreground">
        {m.metadata.totalUsage.totalTokens} tokens
      </span>
    )}
  </div>
))}
```

### Pattern 4: Reasoning (DeepSeek, Claude)

```typescript
// Server: habilitar reasoning
const result = streamText({
  model, // deepseek-r1 ou claude com extended thinking
  messages: await convertToModelMessages(validatedMessages),
})

return result.toUIMessageStreamResponse({
  sendReasoning: true,
})
```

```tsx
// Client: renderizar reasoning
{message.parts.map((part, index) => {
  if (part.type === 'text') {
    return <p key={index}>{part.text}</p>
  }
  if (part.type === 'reasoning') {
    return (
      <details key={index} className="text-sm text-muted-foreground">
        <summary>💭 Raciocínio</summary>
        <pre className="whitespace-pre-wrap">{part.text}</pre>
      </details>
    )
  }
})}
```

### Pattern 5: Chat Page com Persistência (Next.js)

```typescript
// app/chat/page.tsx (Server Component — cria nova conversa)
import { redirect } from 'next/navigation'
import { auth } from '@/core/auth'
import { headers } from 'next/headers'
import { createConversation } from '@/features/chat/service/create-conversation'

export default async function ChatPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const id = await createConversation(session.user.id)
  redirect(`/chat/${id}`)
}
```

```typescript
// app/chat/[id]/page.tsx (Server Component — carrega conversa existente)
import { auth } from '@/core/auth'
import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { loadConversation } from '@/features/chat/service/load-conversation'
import { ChatInterface } from '@/features/chat/components/ChatInterface'

export default async function ChatDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  // ✅ Verificar ownership no server component
  const conversation = await loadConversation(params.id, session.user.id)
  if (!conversation) notFound()

  return (
    <ChatInterface
      chatId={conversation.id}
      initialMessages={conversation.messages}
    />
  )
}
```

## 🔒 Security Checklist

- [ ] Auth check em todo Route Handler (`auth.api.getSession`)
- [ ] Ownership check em toda conversa (`WHERE userId = session.user.id`)
- [ ] Input validation com Zod no server
- [ ] `validateUIMessages` para mensagens com tools/metadata
- [ ] Rate limiting por userId
- [ ] Créditos verificados antes do streaming
- [ ] Créditos debitados após streaming completo (não antes)
- [ ] `consumeStream()` para garantir persistência com disconnect
- [ ] Error messages genéricos no `onError` (nunca expor internals)
- [ ] `credentials: 'include'` no transport para enviar cookies
- [ ] `maxDuration` configurado para prevenir timeouts
- [ ] Nunca confiar em userId/chatId do body — usar session

## ⚠️ Common Gotchas

### 1. useChat mudou significativamente na v6

**Problema**: Patterns antigos (`handleSubmit`, `input` do hook, `content` do message) são obsoletos.

**v6+**:
- Usar `sendMessage({ text })` em vez de `handleSubmit`
- Gerenciar `input` state manualmente com `useState`
- Usar `message.parts` em vez de `message.content`
- Usar `DefaultChatTransport` para configurar endpoint

### 2. Mensagens não persistem após disconnect

**Problema**: Client fecha aba durante streaming → mensagem perdida.

**Solução**: `result.consumeStream()` (sem await) antes de retornar response.

### 3. Créditos debitados mas streaming falha

**Problema**: Debitar antes do streaming → usuário perde crédito sem resposta.

**Solução**: Debitar no `onFinish` callback que só executa após sucesso.

### 4. IDOR em conversas

**Problema**: Client envia `chatId` arbitrário → acessa conversa de outro usuário.

**Solução**: SEMPRE verificar `WHERE conversationId = chatId AND userId = session.user.id`.

### 5. Error messages vazando informações

**Problema**: `error.message` do server contém stack traces, connection strings, etc.

**Solução**: Usar `onError` em `toUIMessageStreamResponse` para retornar mensagem genérica.

## 🎯 Alinhamento com Arquitetura

### Vertical Slice Structure

```
src/features/chat/
├── api/                           # NÃO usar — usar app/api/ como thin wrapper
├── service/
│   ├── handle-chat-stream.ts      # Core: auth → validate → stream → persist
│   ├── create-conversation.ts     # Criar nova conversa
│   ├── load-conversation.ts       # Carregar conversa com ownership check
│   ├── load-messages.ts           # Carregar mensagens do DB
│   ├── save-messages.ts           # Persistir mensagens
│   └── get-model.ts              # Factory para model por template
├── repo/
│   ├── conversations.ts           # Data access conversas
│   └── messages.ts               # Data access mensagens
├── components/
│   ├── ChatInterface.tsx          # useChat principal
│   ├── ChatWithTools.tsx          # useChat com tools
│   ├── MessageList.tsx           # Lista de mensagens
│   └── MessagePart.tsx           # Renderizar parts (text, reasoning, tool)
└── types/
    └── index.ts                   # ChatMetadata, ChatUIMessage
```

### Integração com Outras Features

```typescript
// billing → credits check
import { hasCredits, debitCredits } from '@/features/credits/service/debit-credits'

// auth → session
import { auth } from '@/core/auth'

// db → persistence
import { db } from '@/core/db'
import { conversations, messages } from '@/core/db/schema'
```

## 📖 Resources

- [AI SDK UI Chatbot Guide](./resources/chatbot-patterns.md)
- [Message Persistence Guide](./resources/persistence-guide.md)

## 🔗 Links Úteis

- [AI SDK Docs](https://ai-sdk.dev/docs)
- [AI SDK UI Overview](https://ai-sdk.dev/docs/ai-sdk-ui/overview)
- [useChat Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)
- [Message Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/storing-messages)
- [Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [GitHub](https://github.com/vercel/ai)

## Example Interactions

- "Criar interface de chat com useChat e streaming"
- "Adicionar tool calling ao chat"
- "Implementar persistência de mensagens com Drizzle"
- "Configurar useChat com autenticação Better Auth"
- "Exibir reasoning tokens do DeepSeek no chat"
- "Otimizar chat enviando apenas última mensagem"
- "Implementar retry e error handling no chat"
