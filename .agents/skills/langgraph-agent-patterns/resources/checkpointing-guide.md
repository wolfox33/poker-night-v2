# LangGraph Checkpointing Guide

Guia completo de persistência de estado (checkpointing) com PostgreSQL para manter histórico de conversações.

## 🎯 O que é Checkpointing

Checkpointing permite salvar o estado do agent em cada step, possibilitando:
- **Persistir** histórico de conversas
- **Retomar** conversas de onde pararam
- **Replay** de conversas
- **Time-travel** debugging
- **Auditoria** completa

## 📦 Setup

### Instalação

```bash
npm install @langchain/langgraph-checkpoint-postgres
npm install pg
```

### Database Schema

O PostgreSQL checkpointer cria automaticamente as tabelas necessárias:

```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id ON checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_parent ON checkpoints(parent_checkpoint_id);
```

### Initialize Checkpointer

```typescript
// core/checkpointer.ts
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { Pool } from 'pg'

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Create checkpointer
export const checkpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL!
)

// Setup tables (run once during deployment)
export async function setupCheckpointer() {
  try {
    await checkpointer.setup()
    console.log('Checkpointer tables created successfully')
  } catch (error) {
    console.error('Failed to setup checkpointer:', error)
    throw error
  }
}
```

### Migration Script

```typescript
// scripts/setup-checkpointer.ts
import { setupCheckpointer } from '../core/checkpointer'

async function main() {
  console.log('Setting up checkpointer tables...')
  await setupCheckpointer()
  console.log('Done!')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

Run once:
```bash
npx tsx scripts/setup-checkpointer.ts
```

## 🔧 Compile Graph with Checkpointer

```typescript
// features/chat/agents/graph.ts
import { StateGraph, END } from '@langchain/langgraph'
import { checkpointer } from '@/core/checkpointer'
import { stateChannels } from './state'

export function createGraph() {
  const graph = new StateGraph({ channels: stateChannels })
    .addNode('agent', async (state) => {
      // Agent logic...
      return { messages: [response] }
    })
    .addEdge('__start__', 'agent')
    .addEdge('agent', END)

  // Compile WITH checkpointer
  return graph.compile({
    checkpointer, // Enable state persistence
  })
}
```

## 💾 Using Thread IDs

Thread ID identifica uma conversa única. Use pattern consistente:

```typescript
// Pattern: conversation_{conversationId}
const threadId = `conversation_${conversationId}`

// Invoke with thread
const result = await app.invoke(
  { messages: [new HumanMessage('Hello')] },
  {
    configurable: {
      thread_id: threadId,
    },
  }
)
```

### Thread ID Best Practices

```typescript
// ✅ GOOD: Use conversation ID
const threadId = `conversation_${conversationId}`

// ✅ GOOD: User + date for daily threads
const threadId = `user_${userId}_${date}`

// ✅ GOOD: Session-based
const threadId = `session_${sessionId}`

// ❌ BAD: Random UUID (can't resume)
const threadId = crypto.randomUUID()

// ❌ BAD: User ID only (can't have multiple conversations)
const threadId = `user_${userId}`
```

## 📖 Loading Conversation History

### Get State

```typescript
export async function loadConversation(conversationId: number) {
  const app = createGraph()
  const threadId = `conversation_${conversationId}`

  // Get current state
  const state = await app.getState({
    configurable: {
      thread_id: threadId,
    },
  })

  return {
    messages: state.values.messages || [],
    metadata: state.metadata,
    checkpoint_id: state.config?.configurable?.checkpoint_id,
  }
}
```

### Get State History

```typescript
export async function getConversationHistory(
  conversationId: number,
  limit: number = 10
) {
  const app = createGraph()
  const threadId = `conversation_${conversationId}`

  // Get state history
  const history = await app.getStateHistory({
    configurable: {
      thread_id: threadId,
    },
    limit,
  })

  const states = []
  for await (const state of history) {
    states.push({
      checkpoint_id: state.config?.configurable?.checkpoint_id,
      messages: state.values.messages,
      metadata: state.metadata,
      parent_checkpoint_id: state.config?.configurable?.checkpoint_id,
    })
  }

  return states
}
```

## 🔄 Resuming Conversations

### Continue from Last State

```typescript
export async function continueConversation(
  conversationId: number,
  newMessage: string
) {
  const app = createGraph()
  const threadId = `conversation_${conversationId}`

  // LangGraph automatically loads previous state
  const result = await app.invoke(
    {
      messages: [new HumanMessage(newMessage)],
    },
    {
      configurable: {
        thread_id: threadId,
      },
    }
  )

  return result
}
```

### Resume from Specific Checkpoint

```typescript
export async function resumeFromCheckpoint(
  conversationId: number,
  checkpointId: string,
  newMessage: string
) {
  const app = createGraph()
  const threadId = `conversation_${conversationId}`

  const result = await app.invoke(
    {
      messages: [new HumanMessage(newMessage)],
    },
    {
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId, // Resume from specific point
      },
    }
  )

  return result
}
```

## 🔀 Branching Conversations

### Create Branch

```typescript
export async function branchConversation(
  conversationId: number,
  checkpointId: string,
  newConversationId: number
) {
  const app = createGraph()
  const sourceThread = `conversation_${conversationId}`
  const newThread = `conversation_${newConversationId}`

  // Get state from specific checkpoint
  const state = await app.getState({
    configurable: {
      thread_id: sourceThread,
      checkpoint_id: checkpointId,
    },
  })

  // Start new thread from that state
  await app.updateState(
    {
      configurable: {
        thread_id: newThread,
      },
    },
    state.values
  )

  return newThread
}
```

## 🗑️ Cleanup Old Checkpoints

### Delete Thread Checkpoints

```typescript
export async function deleteConversationCheckpoints(conversationId: number) {
  const threadId = `conversation_${conversationId}`

  // Direct database deletion
  await pool.query('DELETE FROM checkpoints WHERE thread_id = $1', [threadId])
}
```

### Cleanup Old Checkpoints (Cron Job)

```typescript
export async function cleanupOldCheckpoints(daysOld: number = 90) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  const result = await pool.query(
    'DELETE FROM checkpoints WHERE created_at < $1',
    [cutoffDate]
  )

  console.log(`Deleted ${result.rowCount} old checkpoints`)
  return result.rowCount
}

// Run daily via cron
// 0 2 * * * (2 AM daily)
```

### Archive Instead of Delete

```typescript
export const archivedCheckpoints = pgTable('archived_checkpoints', {
  // Same schema as checkpoints
  threadId: text('thread_id').notNull(),
  checkpointId: text('checkpoint_id').notNull(),
  checkpoint: jsonb('checkpoint').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  archivedAt: timestamp('archived_at').defaultNow(),
})

export async function archiveOldCheckpoints(daysOld: number = 90) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  // Copy to archive
  await pool.query(
    `INSERT INTO archived_checkpoints (thread_id, checkpoint_id, checkpoint, metadata, created_at)
     SELECT thread_id, checkpoint_id, checkpoint, metadata, created_at
     FROM checkpoints
     WHERE created_at < $1`,
    [cutoffDate]
  )

  // Delete from main table
  const result = await pool.query(
    'DELETE FROM checkpoints WHERE created_at < $1',
    [cutoffDate]
  )

  return result.rowCount
}
```

## 🎯 Metadata

### Add Metadata to Checkpoints

```typescript
const result = await app.invoke(
  { messages: [new HumanMessage('Hello')] },
  {
    configurable: {
      thread_id: threadId,
    },
    metadata: {
      userId: 123,
      conversationId: 456,
      templateId: 1,
      source: 'web',
      ipAddress: request.ip,
    },
  }
)
```

### Query by Metadata

```typescript
export async function findConversationsByMetadata(
  userId: number,
  templateId: number
) {
  const result = await pool.query(
    `SELECT DISTINCT thread_id, metadata
     FROM checkpoints
     WHERE metadata->>'userId' = $1
     AND metadata->>'templateId' = $2
     ORDER BY created_at DESC`,
    [userId.toString(), templateId.toString()]
  )

  return result.rows
}
```

## 🔍 Debugging with Checkpoints

### Replay Conversation

```typescript
export async function replayConversation(conversationId: number) {
  const app = createGraph()
  const threadId = `conversation_${conversationId}`

  const history = await app.getStateHistory({
    configurable: {
      thread_id: threadId,
    },
  })

  console.log('=== Conversation Replay ===')
  let step = 0

  for await (const state of history) {
   console.log(`\n--- Step ${step} ---`)
    console.log('Messages:', state.values.messages)
    console.log('Metadata:', state.metadata)
    step++
  }
}
```

### Time-travel Debugging

```typescript
export async function debugFromCheckpoint(
  conversationId: number,
  checkpointId: string
) {
  const app = createGraph()
  const threadId = `conversation_${conversationId}`

  // Load state at specific checkpoint
  const state = await app.getState({
    configurable: {
      thread_id: threadId,
      checkpoint_id: checkpointId,
    },
  })

  console.log('State at checkpoint:', state.values)

  // Re-run from that point with different input
  const result = await app.invoke(
    { messages: [new HumanMessage('DEBUG: Alternative path')] },
    {
      configurable: {
        thread_id: `debug_${threadId}`,
        checkpoint_id: checkpointId,
      },
    }
  )

  return result
}
```

## 📊 Analytics

### Checkpoint Statistics

```typescript
export async function getCheckpointStats() {
  const result = await pool.query(`
    SELECT 
      COUNT(DISTINCT thread_id) as total_threads,
      COUNT(*) as total_checkpoints,
      AVG(pg_column_size(checkpoint)) as avg_checkpoint_size,
      MAX(created_at) as latest_checkpoint,
      MIN(created_at) as oldest_checkpoint
    FROM checkpoints
  `)

  return result.rows[0]
}
```

### Thread Activity

```typescript
export async function getThreadActivity(days: number = 7) {
  const result = await pool.query(
    `SELECT 
       DATE(created_at) as date,
       COUNT(DISTINCT thread_id) as active_threads,
       COUNT(*) as total_checkpoints
     FROM checkpoints
     WHERE created_at >= NOW() - INTERVAL '${days} days'
     GROUP BY DATE(created_at)
     ORDER BY date DESC`
  )

  return result.rows
}
```

## ⚠️ Common Gotchas

### 1. Thread ID Consistency

```typescript
// ❌ WRONG: Changing thread ID loses history
const threadId1 = `conversation_${conversationId}`
const threadId2 = `conv_${conversationId}` // Different format!

// ✅ CORRECT: Use consistent format
const threadId = `conversation_${conversationId}`
```

### 2. Checkpoint Cleanup

```typescript
// ❌ WRONG: Never cleanup (database grows forever)
// No cleanup strategy

// ✅ CORRECT: Regular cleanup
await cleanupOldCheckpoints(90) // Run via cron
```

### 3. Large Checkpoints

```typescript
// ❌ WRONG: Storing too much in state
const state = {
  messages: allMessages, // Could be 1000s
  userData: entireUserObject,
  config: massiveConfig,
}

// ✅ CORRECT: Store only what's needed
const state = {
  messages: recentMessages.slice(-20), // Last 20 only
  userId: user.id, // Reference, not full object
}
```

## 🧪 Testing

### Test Persistence

```typescript
describe('Checkpointing', () => {
  it('should persist conversation state', async () => {
    const app = createGraph()
    const threadId = 'test_conversation_123'

    // First message
    await app.invoke(
      { messages: [new HumanMessage('Hello')] },
      { configurable: { thread_id: threadId } }
    )

    // Second message (should remember first)
    const result = await app.invoke(
      { messages: [new HumanMessage('What did I just say?')] },
      { configurable: { thread_id: threadId } }
    )

    // Should have both messages in state
expect(result.messages.length).toBeGreaterThan(2)
  })
})
```

## 📚 Best Practices

1. **Consistent Thread IDs**: Use formato padronizado
2. **Cleanup Strategy**: Archive ou delete checkpoints antigos
3. **Metadata Rich**: Store context útil para analytics
4. **State Size**: Keep state lean, store referências
5. **Error Handling**: Handle checkpoint failures gracefully
6. **Monitoring**: Track checkpoint creation rate e size
7. **Backups**: Regular backups da tabela checkpoints

## 🔗 Resources

- [LangGraph Persistence](https://langchain-ai.github.io/langgraph/how-tos/persistence/)
- [PostgreSQL Checkpointer](https://langchain-ai.github.io/langgraph/reference/checkpoints/)
- [State Management](https://langchain-ai.github.io/langgraph/concepts/low_level/#state)
