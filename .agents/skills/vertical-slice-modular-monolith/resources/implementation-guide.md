# Implementation Guide - Vertical Slice + Modular Monolith

Guia prático de implementação passo a passo para aplicar a arquitetura Vertical Slice + Modular Monolith.

## 📋 Checklist de Implementação

### Fase 1: Setup Inicial

- [ ] Criar estrutura base de diretórios
- [ ] Configurar `core/` com infraestrutura
- [ ] Estabelecer convenções de nomenclatura
- [ ] Configurar ferramentas (linter, formatter, etc.)

### Fase 2: Primeira Feature

- [ ] Identificar feature mais simples para começar
- [ ] Criar estrutura completa da feature
- [ ] Implementar service, repo e API
- [ ] Adicionar testes
- [ ] Documentar padrões estabelecidos

### Fase 3: Features Adicionais

- [ ] Replicar estrutura para novas features
- [ ] Estabelecer comunicação entre features
- [ ] Validar isolamento
- [ ] Refatorar código duplicado para `lib/`

### Fase 4: Refinamento

- [ ] Revisar acoplamento entre features
- [ ] Otimizar performance
- [ ] Adicionar observabilidade
- [ ] Documentar decisões arquiteturais (ADRs)

## 🏗️ Setup Inicial do Projeto

### 1. Estrutura de Diretórios

```bash
# Criar estrutura base
mkdir -p src/{core,features,lib,app}
mkdir -p src/core
mkdir -p src/features
mkdir -p src/lib/{components,utils,types}
mkdir -p src/app
```

### 2. Configurar Core

```typescript
// src/core/db.ts
import { PrismaClient } from '@prisma/client'

export const db = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Singleton pattern
declare global {
  var prisma: PrismaClient | undefined
}

export const prisma = global.prisma || db

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}
```

```typescript
// src/core/config.ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']),
})

export const env = envSchema.parse(process.env)
```

```typescript
// src/core/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty' }
    : undefined,
})
```

```typescript
// src/core/auth.ts
import { verify } from 'jsonwebtoken'
import { env } from './config'

export async function verifyToken(token: string) {
  try {
    const payload = verify(token, env.JWT_SECRET)
    return { success: true, payload }
  } catch (error) {
    return { success: false, error: 'Invalid token' }
  }
}

export function requireAuth(handler: Function) {
  return async (req: any, res: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    
    const result = await verifyToken(token)
    if (!result.success) {
      return res.status(401).json({ error: result.error })
    }
    
    req.user = result.payload
    return handler(req, res)
  }
}
```

## 📦 Criando uma Feature Completa

### Exemplo: Feature de Chat

#### 1. Estrutura

```bash
mkdir -p src/features/chat/{api,service,repo,components}
touch src/features/chat/{types.ts,validators.ts}
```

#### 2. Types

```typescript
// src/features/chat/types.ts
export interface Message {
  id: string
  conversationId: string
  userId: string
  content: string
  role: 'user' | 'assistant' | 'system'
  createdAt: Date
}

export interface Conversation {
  id: string
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export interface SendMessageRequest {
  conversationId: string
  content: string
}

export interface SendMessageResponse {
  message: Message
  aiResponse?: Message
}
```

#### 3. Validators

```typescript
// src/features/chat/validators.ts
import { z } from 'zod'

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(4000),
})

export const createConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
})
```

#### 4. Repository

```typescript
// src/features/chat/repo/chat-repo.ts
import { db } from '@/core/db'
import type { Message, Conversation } from '../types'

export const chatRepo = {
  async saveMessage(data: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    return await db.message.create({
      data: {
        ...data,
        createdAt: new Date(),
      },
    })
  },

  async getConversation(id: string): Promise<Conversation | null> {
    return await db.conversation.findUnique({
      where: { id },
    })
  },

  async getMessages(conversationId: string, limit = 50): Promise<Message[]> {
    return await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  },

  async createConversation(userId: string, title?: string): Promise<Conversation> {
    return await db.conversation.create({
      data: {
        userId,
        title: title || 'New Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
  },
}
```

#### 5. Service

```typescript
// src/features/chat/service/send-message.ts
import { chatRepo } from '../repo/chat-repo'
import { debitCredits } from '@/features/credits/service/debit'
import { processAI } from './process-ai'
import type { SendMessageRequest, SendMessageResponse } from '../types'
import { logger } from '@/core/logger'

export async function sendMessage(
  userId: string,
  request: SendMessageRequest
): Promise<SendMessageResponse> {
  // Validar que conversa pertence ao usuário
  const conversation = await chatRepo.getConversation(request.conversationId)
  if (!conversation || conversation.userId !== userId) {
    throw new Error('Conversation not found')
  }

  // Debitar créditos (comunicação entre features via service)
  const creditResult = await debitCredits(userId, 1)
  if (!creditResult.success) {
    throw new Error('Insufficient credits')
  }

  // Salvar mensagem do usuário
  const userMessage = await chatRepo.saveMessage({
    conversationId: request.conversationId,
    userId,
    content: request.content,
    role: 'user',
  })

  logger.info({ userId, messageId: userMessage.id }, 'User message saved')

  // Processar resposta AI
  const aiResponse = await processAI(request.conversationId, request.content)

  // Salvar resposta AI
  const aiMessage = await chatRepo.saveMessage({
    conversationId: request.conversationId,
    userId,
    content: aiResponse,
    role: 'assistant',
  })

  return {
    message: userMessage,
    aiResponse: aiMessage,
  }
}
```

```typescript
// src/features/chat/service/process-ai.ts
import { chatRepo } from '../repo/chat-repo'
import { openai } from '@/core/openai'

export async function processAI(
  conversationId: string,
  userMessage: string
): Promise<string> {
  // Buscar histórico
  const history = await chatRepo.getMessages(conversationId, 10)

  // Formatar para OpenAI
  const messages = history.reverse().map(msg => ({
    role: msg.role,
    content: msg.content,
  }))

  messages.push({ role: 'user', content: userMessage })

  // Chamar OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
  })

  return response.choices[0].message.content || 'No response'
}
```

#### 6. API

```typescript
// src/features/chat/api/send.ts
import { NextRequest, NextResponse } from 'next/server'
import { sendMessage } from '../service/send-message'
import { sendMessageSchema } from '../validators'
import { requireAuth } from '@/core/auth'

export const POST = requireAuth(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const validated = sendMessageSchema.parse(body)
    
    const userId = req.user.id
    const result = await sendMessage(userId, validated)
    
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

## 🔗 Comunicação Entre Features

### Exemplo: Chat → Credits

```typescript
// ❌ ERRADO: Acessar repo direto
import { creditsRepo } from '@/features/credits/repo/credits-repo'
const balance = await creditsRepo.getBalance(userId)

// ✅ CERTO: Usar service público
import { debitCredits } from '@/features/credits/service/debit'
const result = await debitCredits(userId, amount)
```

### Service Público da Feature Credits

```typescript
// src/features/credits/service/debit.ts
import { creditsRepo } from '../repo/credits-repo'
import { logger } from '@/core/logger'

export async function debitCredits(userId: string, amount: number) {
  const balance = await creditsRepo.getBalance(userId)
  
  if (balance < amount) {
    logger.warn({ userId, balance, amount }, 'Insufficient credits')
    return { success: false, error: 'Insufficient credits' }
  }
  
  await creditsRepo.debit(userId, amount)
  
  logger.info({ userId, amount }, 'Credits debited')
  return { success: true }
}

export async function creditCredits(userId: string, amount: number) {
  await creditsRepo.credit(userId, amount)
  logger.info({ userId, amount }, 'Credits credited')
  return { success: true }
}

export async function getBalance(userId: string) {
  return await creditsRepo.getBalance(userId)
}
```

## 🧪 Testing

### Unit Tests (Service Layer)

```typescript
// src/features/chat/service/send-message.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendMessage } from './send-message'
import { chatRepo } from '../repo/chat-repo'
import { debitCredits } from '@/features/credits/service/debit'

// Mock dependencies
vi.mock('../repo/chat-repo')
vi.mock('@/features/credits/service/debit')
vi.mock('./process-ai')

describe('sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should send message successfully', async () => {
    // Arrange
    const userId = 'user-123'
    const request = {
      conversationId: 'conv-123',
      content: 'Hello',
    }

    vi.mocked(chatRepo.getConversation).mockResolvedValue({
      id: 'conv-123',
      userId: 'user-123',
      title: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    vi.mocked(debitCredits).mockResolvedValue({ success: true })
    
    vi.mocked(chatRepo.saveMessage).mockResolvedValue({
      id: 'msg-123',
      conversationId: 'conv-123',
      userId: 'user-123',
      content: 'Hello',
      role: 'user',
      createdAt: new Date(),
    })

    // Act
    const result = await sendMessage(userId, request)

    // Assert
    expect(result.message.content).toBe('Hello')
    expect(debitCredits).toHaveBeenCalledWith(userId, 1)
  })

  it('should throw error if insufficient credits', async () => {
    // Arrange
    vi.mocked(chatRepo.getConversation).mockResolvedValue({
      id: 'conv-123',
      userId: 'user-123',
      title: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    vi.mocked(debitCredits).mockResolvedValue({
      success: false,
      error: 'Insufficient credits',
    })

    // Act & Assert
    await expect(
      sendMessage('user-123', {
        conversationId: 'conv-123',
        content: 'Hello',
      })
    ).rejects.toThrow('Insufficient credits')
  })
})
```

### Integration Tests

```typescript
// src/features/chat/api/send.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestServer } from '@/test/utils'

describe('POST /api/chat/send', () => {
  let server: any
  let authToken: string

  beforeAll(async () => {
    server = await createTestServer()
    authToken = await server.createTestUser()
  })

  afterAll(async () => {
    await server.cleanup()
  })

  it('should send message and receive AI response', async () => {
    // Create conversation
    const conv = await server.post('/api/chat/conversations', {
      headers: { Authorization: `Bearer ${authToken}` },
    })

    // Send message
    const response = await server.post('/api/chat/send', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        conversationId: conv.id,
        content: 'Hello AI',
      },
    })

    expect(response.status).toBe(200)
    expect(response.body.message.content).toBe('Hello AI')
    expect(response.body.aiResponse).toBeDefined()
  })
})
```

## 📊 Observabilidade

### Logging

```typescript
// src/features/chat/service/send-message.ts
import { logger } from '@/core/logger'

export async function sendMessage(userId: string, request: SendMessageRequest) {
  logger.info(
    { userId, conversationId: request.conversationId },
    'Processing message'
  )

  try {
    // ... lógica
    
    logger.info(
      { userId, messageId: result.message.id },
      'Message processed successfully'
    )
    
    return result
  } catch (error) {
    logger.error(
      { userId, error, conversationId: request.conversationId },
      'Failed to process message'
    )
    throw error
  }
}
```

### Metrics

```typescript
// src/core/metrics.ts
import { Counter, Histogram } from 'prom-client'

export const messageCounter = new Counter({
  name: 'chat_messages_total',
  help: 'Total number of chat messages',
  labelNames: ['feature', 'status'],
})

export const messageLatency = new Histogram({
  name: 'chat_message_duration_seconds',
  help: 'Message processing duration',
  labelNames: ['feature'],
})
```

```typescript
// src/features/chat/service/send-message.ts
import { messageCounter, messageLatency } from '@/core/metrics'

export async function sendMessage(userId: string, request: SendMessageRequest) {
  const end = messageLatency.startTimer({ feature: 'chat' })
  
  try {
    const result = await processMessage(userId, request)
    messageCounter.inc({ feature: 'chat', status: 'success' })
    return result
  } catch (error) {
    messageCounter.inc({ feature: 'chat', status: 'error' })
    throw error
  } finally {
    end()
  }
}
```

## 🔄 Migração de Arquitetura Tradicional

### Antes (Camadas)

```
src/
  controllers/
    UserController.ts
    ChatController.ts
  services/
    UserService.ts
    ChatService.ts
  repositories/
    UserRepository.ts
    ChatRepository.ts
```

### Depois (Vertical Slice)

```
src/
  features/
    users/
      api/
      service/
      repo/
    chat/
      api/
      service/
      repo/
```

### Passos de Migração

1. **Criar estrutura de features**
2. **Mover código por domínio** (não por camada)
3. **Refatorar dependências** entre features
4. **Extrair código compartilhado** para `lib/`
5. **Atualizar imports**
6. **Adicionar testes**
7. **Remover estrutura antiga**

## 📝 Best Practices

1. **Feature deve ser auto-contida**: Tudo relacionado a um domínio em um lugar
2. **Service é a API pública**: Outras features só chamam services
3. **Repo é privado**: Apenas service da própria feature acessa
4. **Validação na borda**: API valida entrada, service assume dados válidos
5. **Erros específicos**: Criar tipos de erro por domínio
6. **Logging estruturado**: Sempre incluir contexto (userId, featureId, etc.)
7. **Testes próximos ao código**: `.test.ts` ao lado do arquivo testado

## 🚀 Próximos Passos

1. Implementar primeira feature seguindo este guia
2. Documentar padrões específicos do seu projeto
3. Criar templates reutilizáveis
4. Estabelecer CI/CD
5. Adicionar monitoramento e alertas
