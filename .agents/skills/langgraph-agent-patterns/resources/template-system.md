# LangGraph Template System

Sistema de templates para criar diferentes tipos de agentes AI com configurações específicas.

## 🎯 Conceito

Templates permitem criar múltiplos agentes com comportamentos diferentes sem duplicar código. Cada template define:
- System prompt
- Modelo LLM
- Configurações (temperature, max_tokens)
- Tools disponíveis
- Metadata adicional

## 📊 Database Schema

```typescript
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(), // 'gpt-4' | 'gpt-3.5-turbo' | 'claude-3-opus'
  temperature: real('temperature').default(0.7),
  maxTokens: integer('max_tokens').default(2000),
  tools: jsonb('tools'), // ['calculator', 'web_search']
  config: jsonb('config'), // Additional settings
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
```

## 🌟 Template Examples

### Generic Assistant

```typescript
{
  name: 'generic',
  description: 'General purpose helpful assistant',
  systemPrompt: `You are a helpful AI assistant. Provide clear, concise, and accurate answers.
  
  Guidelines:
  - Be friendly and professional
  - If you don't know something, say so
  - Provide sources when relevant
  - Keep responses focused and valuable`,
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 1500,
}
```

### Legal Advisor (Brazil)

```typescript
{
  name: 'legal',
  description: 'Brazilian legal advice assistant',
  systemPrompt: `You are a legal AI assistant specialized in Brazilian law.
  
  Your role:
  - Provide accurate information about Brazilian laws and regulations
  - Explain legal concepts in simple Portuguese
  - Help users understand their legal rights and obligations
  - Cite relevant laws when applicable (Lei nº, Art., etc.)
  
  Important disclaimers:
  - Always remind users that this is NOT official legal advice
  - Encourage consulting a qualified lawyer for specific cases
  - Clarify that you cannot represent users in legal matters
  
  Areas of expertise:
  - Direito do Consumidor (CDC)
  - Direito do Trabalho (CLT)
  - Direito Civil
  - Direito de Família`,
  model: 'gpt-4',
  temperature: 0.3, // Lower for accuracy
  maxTokens: 2000,
  tools: ['legal_database', 'web_search'],
}
```

### Financial Advisor

```typescript
{
  name: 'financial',
  description: 'Personal finance and investing advisor',
  systemPrompt: `You are a financial advisor AI helping users with personal finance.
  
  Your expertise:
  - Budgeting and expense tracking
  - Saving strategies
  - Investment basics (stocks, bonds, ETFs, crypto)
  - Debt management
  - Retirement planning
  
  Guidelines:
  - Provide educational content, not financial advice
  - Always include risk disclaimers
  - Encourage diversification
  - Use BR currency (R$) when relevant
  - Consider Brazilian context (Tesouro Direto, CDI, SELIC, etc.)
  
  Disclaimer: This information is for educational purposes only. Always consult a certified financial advisor before making investment decisions.`,
  model: 'gpt-4',
  temperature: 0.5,
  maxTokens: 2000,
  tools: ['calculator', 'market_data'],
}
```

### Creative Writing

```typescript
{
  name: 'creative',
  description: 'Creative writing and brainstorming assistant',
  systemPrompt: `You are a creative writing assistant. Help users:
  
  - Brainstorm story ideas
  - Develop characters
  - Create plot outlines
  - Overcome writer's block
  - Improve writing style
  - Generate creative prompts
  
  Be imaginative, supportive, and encourage creativity. Ask questions to understand the user's vision.`,
  model: 'claude-3-opus',
  temperature: 0.9, // Higher for creativity
  maxTokens: 3000,
}
```

### Technical Support

```typescript
{
  name: 'tech-support',
  description: 'Technical support for software/hardware issues',
  systemPrompt: `You are a technical support AI assistant. Help users troubleshoot:
  
  - Software issues (Windows, macOS, Linux)
  - Hardware problems
  - Network connectivity
  - App configuration
  - Common error messages
  
  Approach:
  1. Ask clarifying questions
  2. Provide step-by-step solutions
  3. Explain technical concepts simply
  4. Suggest preventive measures
  
  Be patient and clear in your explanations.`,
  model: 'gpt-4',
  temperature: 0.4,
  maxTokens: 2000,
}
```

## 🔧 Template Management

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

  if (!template[0].isActive) {
    throw new Error(`Template ${templateId} is inactive`)
  }

  return template[0]
}
```

### List Templates

```typescript
export async function listTemplates() {
  const allTemplates = await db
    .select()
    .from(templates)
    .where(eq(templates.isActive, true))
    .orderBy(templates.name)

  return allTemplates
}
```

### Create Template

```typescript
export async function createTemplate(data: {
  name: string
  description?: string
  systemPrompt: string
  model: string
  temperature?: number
  maxTokens?: number
  tools?: string[]
  config?: Record<string, any>
}) {
  const [template] = await db.insert(templates).values(data).returning()

  return template
}
```

### Update Template

```typescript
export async function updateTemplate(
  templateId: number,
  updates: Partial<typeof templates.$inferInsert>
) {
  const [updated] = await db
    .update(templates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(templates.id, templateId))
    .returning()

  return updated
}
```

## 🎨 Dynamic Agent Factory

### Create Agent from Template

```typescript
// features/chat/agents/factory.ts
import { StateGraph, END } from '@langchain/langgraph'
import { SystemMessage } from '@langchain/core/messages'
import { models } from '@/core/llm'
import { loadTemplate } from '../service/load-template'
import { stateChannels } from './state'

export async function createAgent(templateId: number) {
  const template = await loadTemplate(templateId)

  // Select model
  const model = models[template.model as keyof typeof models]

  if (!model) {
    throw new Error(`Model ${template.model} not found`)
  }

  // Configure model
  model.temperature = template.temperature ?? 0.7
  model.maxTokens = template.maxTokens ?? 2000

  // Build graph
  const graph = new StateGraph({ channels: stateChannels })
    .addNode('agent', async (state) => {
      const messages = [
        new SystemMessage(template.systemPrompt),
        ...state.messages,
      ]

      const response = await model.invoke(messages)

      return { messages: [response] }
    })
    .addEdge('__start__', 'agent')
    .addEdge('agent', END)

  return graph.compile({ checkpointer })
}
```

## 🛠️ Tools Integration

### Define Tools

```typescript
// lib/tools.ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export const calculator = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Simple eval (use math.js in production)
      const result = eval(expression)
      return `Result: ${result}`
    } catch (error) {
      return 'Invalid expression'
    }
  },
  {
    name: 'calculator',
    description: 'Calculate mathematical expressions',
    schema: z.object({
      expression: z.string().describe('Mathematical expression to evaluate'),
    }),
  }
)

export const webSearch = tool(
  async ({ query }: { query: string }) => {
    // Implement web search (Tavily, SerpAPI, etc.)
    return `Search results for: ${query}`
  },
  {
    name: 'web_search',
    description: 'Search the web for current information',
    schema: z.object({
      query: z.string().describe('Search query'),
    }),
  }
)

export const availableTools = {
  calculator,
  web_search: webSearch,
}
```

### Use Tools in Template

```typescript
export async function createAgent(templateId: number) {
  const template = await loadTemplate(templateId)
  const model = models[template.model as keyof typeof models]

  // Bind tools if template specifies
  const toolList = (template.tools || [])
    .map(name => availableTools[name as keyof typeof availableTools])
    .filter(Boolean)

  const modelWithTools = toolList.length > 0
    ? model.bind({ tools: toolList })
    : model

  // Graph com tools...
}
```

## 🎯 Template Versioning

### Version Schema

```typescript
export const templateVersions = pgTable('template_versions', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').references(() => templates.id),
  version: integer('version').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  config: jsonb('config'),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
})
```

### Create Version

```typescript
export async function createTemplateVersion(
  templateId: number,
  updates: { systemPrompt: string; config?: any }
) {
  const template = await loadTemplate(templateId)

  // Get latest version number
  const latestVersion = await db
    .select()
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId))
    .orderBy(desc(templateVersions.version))
    .limit(1)

  const newVersion = (latestVersion[0]?.version || 0) + 1

  // Create new version
  await db.insert(templateVersions).values({
    templateId,
    version: newVersion,
    systemPrompt: updates.systemPrompt,
    config: updates.config,
  })

  // Update main template
  await updateTemplate(templateId, updates)

  return newVersion
}
```

## 🧪 Testing Templates

### Test Template

```typescript
// features/chat/agents/factory.test.ts
import { createAgent } from '@/features/chat/agents/factory'
import { HumanMessage } from '@langchain/core/messages'

describe('Templates', () => {
  it('should create generic agent', async () => {
    const agent = await createAgent(1) // Generic template

    const result = await agent.invoke({
      messages: [new HumanMessage('Hello!')],
    })

    const lastMessage = result.messages[result.messages.length - 1]
    expect(lastMessage.content).toBeTruthy()
  })

  it('should use correct temperature', async () => {
    const template = await loadTemplate(2) // Legal template
    expect(template.temperature).toBe(0.3)
  })
})
```

## 📊 Template Analytics

### Track Template Usage

```typescript
export const templateUsage = pgTable('template_usage', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').references(() => templates.id),
  userId: integer('user_id').references(() => users.id),
  conversationId: integer('conversation_id'),
  messagesCount: integer('messages_count').default(1),
  createdAt: timestamp('created_at').defaultNow(),
})

// Log usage
export async function logTemplateUsage(
  templateId: number,
  userId: number,
  conversationId: number
) {
  await db.insert(templateUsage).values({
    templateId,
    userId,
    conversationId,
  })
}
```

### Popular Templates

```typescript
export async function getPopularTemplates(limit: number = 10) {
  const popular = await db
    .select({
      template: templates,
      usageCount: sql<number>`count(${templateUsage.id})`,
    })
    .from(templates)
    .leftJoin(templateUsage, eq(templates.id, templateUsage.templateId))
    .groupBy(templates.id)
    .orderBy(desc(sql`count(${templateUsage.id})`))
    .limit(limit)

  return popular
}
```

## 🔒 Template Permissions

### User-specific Templates

```typescript
export const userTemplates = pgTable('user_templates', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  templateId: integer('template_id').references(() => templates.id),
  isOwner: boolean('is_owner').default(false),
  canEdit: boolean('can_edit').default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// Check permission
export async function canUseTemplate(userId: number, templateId: number) {
  const template = await loadTemplate(templateId)

  // Public templates
  if (!template.isPrivate) return true

  // Check user permission
  const permission = await db
    .select()
    .from(userTemplates)
    .where(
      and(
        eq(userTemplates.userId, userId),
        eq(userTemplates.templateId, templateId)
      )
    )
    .limit(1)

  return permission.length > 0
}
```

## 📚 Best Practices

1. **Clear System Prompts**: Especificar claramente o role, expertise e guidelines
2. **Appropriate Temperature**: 0.3-0.5 para factual, 0.7-0.9 para creative
3. **Token Limits**: Set based on use case (chat: 1500-2000, long-form: 3000+)
4. **Disclaimers**: Incluir avisos legais quando relevante (legal, medical, financial)
5. **Context Window**: Considerar limite do modelo ao definir system prompt
6. **Testing**: Testar templates com casos reais antes de deploy
7. **Versioning**: Manter histórico de mudanças importantes
8. **Analytics**: Track performance e user satisfaction por template

## 🔗 Resources

- [OpenAI Prompt Engineering](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic Prompt Library](https://docs.anthropic.com/claude/prompt-library)
- [LangChain Templates](https://python.langchain.com/docs/templates/)
