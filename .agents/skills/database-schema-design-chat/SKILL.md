---
name: database-schema-design-chat
description : Padrões de design de schema PostgreSQL/Drizzle para aplicações de chat incluindo conversations, messages, templates, users, optimistic locking, indexes estratégicos e migrations.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 5
  tags: [database, drizzle, postgresql, schema, migrations, chat]
  compatible_with: [antigravity, windsurf, opencode]
---

# Database Schema Design for Chat

Guia completo de design de schema para aplicações de chat com PostgreSQL e Drizzle ORM.

## 🎯 Objetivo

Fornecer:
- **Schema completo** para chat (users, conversations, messages, templates)
- **Indexes estratégicos** para performance
- **Relationships** corretas (foreign keys)
- **Migrations** best practices
- **Data integrity** (constraints, validation)

## Use this skill when

- Designing chat database
- Planning schema migrations
- Optimizing query performance
- Implementing relationships
- Designing for scale

## Quick Reference

### Core Schema

```typescript
// core/db/schema.ts
import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  credits: integer('credits').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(),
  temperature: real('temperature').default(0.7),
  isActive: boolean('is_active').default(true),
})

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  templateId: integer('template_id').references(() => templates.id),
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id).notNull(),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  tokens: integer('tokens'),
  cost: numeric('cost', { precision: 10, scale: 6 }),
  createdAt: timestamp('created_at').defaultNow(),
})
```

### Indexes

```typescript
import { index } from 'drizzle-orm/pg-core'

// Conversation indexes
index('conversations_user_id_idx').on(conversations.userId),
index('conversations_updated_at_idx').on(conversations.updatedAt),

// Message indexes
index('messages_conversation_id_idx').on(messages.conversationId),
index('messages_created_at_idx').on(messages.createdAt),
```

## 📖 Resources

- [Schema Examples](./resources/schema-examples.md)
- [Migration Guide](./resources/migration-guide.md)

## 🔗 Links Úteis  

- [Drizzle ORM](https://orm.drizzle.team)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
