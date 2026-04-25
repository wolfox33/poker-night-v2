---
name: langgraph-agent-patterns
description: Padrões de implementação de agentes AI com LangGraph 1.0 para chat SaaS. Cobre setup, template system, checkpointing, streaming, state management, cost tracking (1 crédito = 1 mensagem), error handling e multi-agent patterns. Integração com PostgreSQL persistence.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 6
  tags: [langgraph, ai, agents, chat, streaming, checkpointing, state-management]
  compatible_with: [antigravity, windsurf, opencode]
---

# LangGraph Agent Patterns

Guia completo de implementação de agentes AI com LangGraph 1.0 para aplicações SaaS de chat, com foco em templates, persistência e streaming.

## 🎯 Objetivo

Fornecer:
- **Setup correto** do LangGraph 1.0
- **Template system** para diferentes tipos de agentes
- **Checkpointing** com PostgreSQL
- **Streaming** de respostas
- **State management** robusto
- **Cost tracking** (créditos por mensagem)
- **Error handling** e fallbacks
- **Multi-agent patterns**

## Use this skill when

- Implementando sistema de chat com AI
- Configurando templates de agentes
- Debugando problemas de state/persistence
- Implementando streaming de respostas
- Tracking custos de LLM calls
- Criando multiple agent templates
- Integrando checkpointing com DB

## Do not use this skill when

- Não usa AI/LLMs no projeto
- Usa outro framework (LangChain sem Graph, custom)
- Chat muito simples (single prompt/response)
- Não precisa de state persistence

## Instructions

1. **Setup inicial**: Instalar LangGraph e dependencies
2. **Configure checkpointer**: Setup PostgreSQL persistence
3. **Criar base graph**: Implementar graph básico
4. **Implementar templates**: Criar templates para diferentes use cases
5. **Add streaming**: Configurar SSE para real-time responses
6. **State management**: Handle conversation state
7. **Cost tracking**: Track tokens/créditos por mensagem
8. **Error handling**: Implement fallbacks e retry

Consulte `resources/template-system.md` para sistema de templates, `resources/checkpointing-guide.md` para persistence e `resources/streaming-patterns.md` para streaming.

## Safety

- **Sempre** validar user input
- **Implementar** rate limiting
- **Track** token usage para billing
- **Usar** timeouts em LLM calls
- **Sanitizar** output antes de exibir
- **Log** todas as interações
- **Implementar** fallbacks para errors
- **Validar** state antes de persistir

## 📚 Quick Reference

### Installation

```bash
npm install @langchain/langgraph
npm install @langchain/core
npm install @langchain/openai
npm install @langchain/anthropic
npm install @langchain/postgres
```

### Environment Variables

```bash
# LLM Provider
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/db"
```

### Create Basic Agent

```typescript
import { StateGraph } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"

const model = new ChatOpenAI({ modelName: "gpt-4" })

const graph = new StateGraph({
  channels: {
    messages: { value: (x, y) => x.concat(y), default: () => [] },
  },
})
  .addNode("agent", async (state) => {
    const response = await model.invoke(state.messages)
    return { messages: [response] }
  })
  .addEdge("__start__", "agent")
  .addEdge("agent", "__end__")

const app = graph.compile()
```

## 🏗️ Core Setup

### 1. Cliente LLM

```typescript
// core/llm.ts
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'

export const models = {
  'gpt-4': new ChatOpenAI({
    modelName: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
  }),
  'gpt-3.5-turbo': new ChatOpenAI({
    modelName: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1500,
  }),
  'claude-3-opus': new ChatAnthropic({
    modelName: 'claude-3-opus-20240229',
    temperature: 0.7,
    maxTokens: 2000,
  }),
}

export type ModelName = keyof typeof models
```

### 2. PostgreSQL Checkpointer

```typescript
// core/checkpointer.ts
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const checkpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!
)

// Setup tables (run once)
export async function setupCheckpointer() {
  await checkpointer.setup()
}
```

### 3. State Schema

```typescript
// features/chat/agents/state.ts
import { BaseMessage } from '@langchain/core/messages'
import { StateGraphArgs } from '@langchain/langgraph'

export interface AgentState {
  messages: BaseMessage[]
  userId: number
  conversationId: number
  templateId: number
  metadata?: Record<string, any>
}

export const stateChannels: StateGraphArgs<AgentState>['channels'] = {
  messages: {
    value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [],
  },
  userId: {
    value: (x?: number, y?: number) => y ?? x,
    default: () => 0,
  },
  conversationId: {
    value: (x?: number, y?: number) => y ?? x,
    default: () => 0,
  },
  templateId: {
    value: (x?: number, y?: number) => y ?? x,
    default: () => 0,
  },
  metadata: {
    value: (x?: Record<string, any>, y?: Record<string, any>) => ({ ...x, ...y }),
    default: () => ({}),
  },
}
```

## 🎨 Template System

### Template Schema (Database)

```typescript
// core/db/schema.ts
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(), // 'gpt-4' | 'claude-3-opus'
  temperature: real('temperature').default(0.7),
  maxTokens: integer('max_tokens').default(2000),
  tools: jsonb('tools'), // Available tools
  config: jsonb('config'), // Additional config
  createdAt: timestamp('created_at').defaultNow(),
})
```

### Template Examples

```typescript
// Seed templates
const TEMPLATES = [
  {
    name: 'generic',
    description: 'Generic helpful assistant',
    systemPrompt: 'You are a helpful AI assistant. Provide clear, concise answers.',
    model: 'gpt-3.5-turbo',
  },
  {
    name: 'legal',
    description: 'Legal advice assistant',
    systemPrompt: `You are a legal AI assistant specialized in Brazilian law.
    Provide accurate legal information but always remind users to consult a lawyer.`,
    model: 'gpt-4',
    temperature: 0.3,
  },
  {
    name: 'financial',
    description: 'Financial advisor',
    systemPrompt: `You are a financial advisor AI. Help users with budgeting, 
    investing, and financial planning. Always include risk disclaimers.`,
    model: 'gpt-4',
    tools: ['calculator', 'web_search'],
  },
  {
    name: 'creative',
    description: 'Creative writing assistant',
    systemPrompt: 'You are a creative writing assistant. Help with storytelling, brainstorming, and creative ideas.',
    model: 'claude-3-opus',
    temperature: 0.9,
  },
]
```

### Load Template

```typescript
// features/chat/service/load-template.ts
import { db } from '@/core/db'
import { templates } from '@/core/db/schema'
import { eq } from 'drizzle-orm'

export async function loadTemplate(templateId: number) {
  const template = await db
    .select()
    .from(templates)
    .where(eq(templates.id, templateId))
    .limit(1)

  if (!template[0]) {
    throw new Error(`Template ${templateId} not found`)
  }

  return template[0]
}
```

## 🔄 Agent Graph Implementation

### Base Agent

```typescript
// features/chat/agents/graph.ts
import { StateGraph, END } from '@langchain/langgraph'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { models } from '@/core/llm'
import { checkpointer } from '@/core/checkpointer'
import { stateChannels, AgentState } from './state'
import { loadTemplate } from '../service/load-template'

export async function createAgentGraph(templateId: number) {
  const template = await loadTemplate(templateId)
  const model = models[template.model as keyof typeof models]

  const graph = new StateGraph<AgentState>({ channels: stateChannels })
    .addNode('agent', async (state) => {
      // Construir messages com system prompt
      const messages = [
        new SystemMessage(template.systemPrompt),
        ...state.messages,
      ]

      // Call LLM
      const response = await model.invoke(messages)

      return {
        messages: [response],
      }
    })
    .addEdge('__start__', 'agent')
    .addEdge('agent', END)

  // Compile com checkpointer
  const app = graph.compile({
    checkpointer,
  })

  return app
}
```

### Invoke Agent

```typescript
// features/chat/service/send-message.ts
import { createAgentGraph } from '../agents/graph'
import { HumanMessage } from '@langchain/core/messages'
import { debitCredits } from '@/features/credits/service/debit-credits'

interface SendMessageParams {
  userId: number
  conversationId: number
  templateId: number
  content: string
}

export async function sendMessage(params: SendMessageParams) {
  const { userId, conversationId, templateId, content } = params

  // Debit credit BEFORE processing
  await debitCredits(userId, 1)

  try {
    const app = await createAgentGraph(templateId)

    // Thread ID para persistence
    const threadId = `conversation_${conversationId}`

    // Invoke agent
    const result = await app.invoke(
      {
        messages: [new HumanMessage(content)],
        userId,
        conversationId,
        templateId,
      },
      {
        configurable: {
          thread_id: threadId,
        },
      }
    )

    const aiMessage = result.messages[result.messages.length - 1]

    return {
      role: 'assistant',
      content: aiMessage.content,
    }
  } catch (error) {
    // Refund credit on error
    await addCredits(userId, 1)
    throw error
  }
}
```

## 📡 Streaming Implementation

### Stream Response

```typescript
// features/chat/service/stream-response.ts
import { createAgentGraph } from '../agents/graph'
import { HumanMessage } from '@langchain/core/messages'

export async function streamResponse(params: SendMessageParams) {
  const { userId, conversationId, templateId, content } = params

  const app = await createAgentGraph(templateId)
  const threadId = `conversation_${conversationId}`

  // Stream events
  const stream = await app.stream(
    {
      messages: [new HumanMessage(content)],
      userId,
      conversationId,
      templateId,
    },
    {
      configurable: {
        thread_id: threadId,
      },
      streamMode: 'values', // 'values' | 'updates' | 'messages'
    }
  )

  return stream
}
```

### SSE API Route

```typescript
// app/api/chat/stream/route.ts
import { NextRequest } from 'next/server'
import { auth } from '@/core/auth'
import { streamResponse } from '@/features/chat/service/stream-response'
import { debitCredits, hasCredits } from '@/features/credits/service/debit-credits'
import { z } from 'zod'

const streamSchema = z.object({
  conversationId: z.number().int().positive(),
  content: z.string().min(1).max(10000),
  templateId: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  // 1. Autenticar
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Validar input
  const body = await req.json()
  const parsed = streamSchema.safeParse(body)
  if (!parsed.success) {
    return new Response('Invalid input', { status: 400 })
  }

  const { conversationId, content, templateId } = parsed.data

  // 3. Verificar ownership da conversa (prevenir IDOR)
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

  // 4. Verificar se tem créditos ANTES (sem debitar)
  const hasBalance = await hasCredits(session.user.id, 1)
  if (!hasBalance) {
    return new Response('Insufficient credits', { status: 402 })
  }

  try {
    const stream = await streamResponse({
      userId: session.user.id,
      conversationId,
      templateId,
      content,
    })

    // Create SSE stream
    const encoder = new TextEncoder()
    let streamCompleted = false

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const messages = chunk.messages
            const lastMessage = messages[messages.length - 1]

            if (lastMessage.content) {
              const data = JSON.stringify({
                content: lastMessage.content,
                done: false,
              })

              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }
          }

          streamCompleted = true

          // ✅ Debitar crédito SOMENTE após streaming completo com sucesso
          await debitCredits(session.user.id, 1, 'message_sent', {
            conversationId,
          })

          // Send done signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          // ❌ Streaming falhou → NÃO debitar crédito
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed', done: true })}\n\n`)
          )
          controller.close()
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
  } catch (error) {
    console.error('Stream error:', error)
    return new Response('Internal error', { status: 500 })
  }
}
```

## 💾 State Persistence

### Load Conversation History

```typescript
// features/chat/service/load-conversation.ts
import { createAgentGraph } from '../agents/graph'

export async function loadConversationHistory(
  conversationId: number,
  templateId: number
) {
  const app = await createAgentGraph(templateId)
  const threadId = `conversation_${conversationId}`

  // Get state from checkpointer
  const state = await app.getState({
    configurable: {
      thread_id: threadId,
    },
  })

  return state.values.messages || []
}
```

### Update State

```typescript
// Update state manualmente (se necessário)
export async function updateConversationState(
  conversationId: number,
  templateId: number,
  updates: Partial<AgentState>
) {
  const app = await createAgentGraph(templateId)
  const threadId = `conversation_${conversationId}`

  await app.updateState(
    {
      configurable: {
        thread_id: threadId,
      },
    },
    updates
  )
}
```

## 💰 Cost Tracking

### Token Tracking

```typescript
// core/token-counter.ts
import { encoding_for_model } from '@dqbd/tiktoken'

export function countTokens(text: string, model: string = 'gpt-3.5-turbo'): number {
  const encoding = encoding_for_model(model as any)
  const tokens = encoding.encode(text)
  encoding.free()
  return tokens.length
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const pricing = {
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
    'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 },
    'claude-3-opus': { input: 0.015 / 1000, output: 0.075 / 1000 },
  }

  const price = pricing[model as keyof typeof pricing] || pricing['gpt-3.5-turbo']

  return inputTokens * price.input + outputTokens * price.output
}
```

### Log Usage

```typescript
// core/db/schema.ts
export const usage = pgTable('usage', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  conversationId: integer('conversation_id').references(() => conversations.id),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cost: real('cost').notNull(), // USD
  createdAt: timestamp('created_at').defaultNow(),
})
```

### Track in Agent

```typescript
.addNode('agent', async (state) => {
  const messages = [new SystemMessage(template.systemPrompt), ...state.messages]

  // Count input tokens
  const inputText = messages.map(m => m.content).join('\n')
  const inputTokens = countTokens(inputText, template.model)

  const response = await model.invoke(messages)

  // Count output tokens
  const outputTokens = countTokens(response.content as string, template.model)

  // Estimate cost
  const cost = estimateCost(inputTokens, outputTokens, template.model)

  // Log usage
  await db.insert(usage).values({
    userId: state.userId,
    conversationId: state.conversationId,
    model: template.model,
    inputTokens,
    outputTokens,
    cost,
  })

  return { messages: [response] }
})
```

## 🛡️ Error Handling

### Retry Logic

```typescript
async function invokeWithRetry(model: any, messages: any[], maxRetries = 3) {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await model.invoke(messages)
    } catch (error) {
      lastError = error as Error
      console.error(`Attempt ${attempt + 1} failed:`, error)

      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * 2 ** attempt, 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}
```

### Timeout

```typescript
async function invokeWithTimeout(model: any, messages: any[], timeoutMs = 30000) {
  return Promise.race([
    model.invoke(messages),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    ),
  ])
}
```

### Fallback Response

```typescript
.addNode('agent', async (state) => {
  try {
    const response = await invokeWithTimeout(model, messages, 30000)
    return { messages: [response] }
  } catch (error) {
    console.error('Agent error:', error)

    // Fallback response
    return {
      messages: [
        new AIMessage(
          'Desculpe, estou com dificuldades para processar sua mensagem no momento. Por favor, tente novamente.'
        ),
      ],
    }
  }
})
```

## 🎯 Alinhamento com Arquitetura

### Vertical Slice Structure

```
src/features/chat/
├── api/
│   ├── send.ts              # POST /api/chat/send
│   └── stream.ts             # POST /api/chat/stream
├── service/
│   ├── send-message.ts       # Non-streaming
│   ├── stream-response.ts    # Streaming
│   ├── load-template.ts      # Template loading
│   └── load-conversation.ts  # History loading
├── agents/
│   ├── graph.ts              # LangGraph definition
│   ├── state.ts              # State schema
│   └── templates/
│       ├── generic.ts
│       ├── legal.ts
│       └── financial.ts
├── repo/
│   ├── conversations.ts
│   └── messages.ts
└── components/
    ├── ChatInterface.tsx
    └── MessageList.tsx
```

## 📖 Resources

- [Template System](./resources/template-system.md) - Sistema de templates
- [Checkpointing Guide](./resources/checkpointing-guide.md) - Persistence guide
- [Streaming Patterns](./resources/streaming-patterns.md) - Streaming implementation

## 🔗 Links Úteis

- [LangGraph Docs](https://langchain-ai.github.io/langgraph/)
- [State Persistence](https://langchain-ai.github.io/langgraph/how-tos/persistence/)
- [Streaming](https://langchain-ai.github.io/langgraph/how-tos/streaming/)
- [PostgreSQL Checkpointer](https://langchain-ai.github.io/langgraph/reference/checkpoints/)
