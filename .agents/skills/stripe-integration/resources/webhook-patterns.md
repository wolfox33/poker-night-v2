# Stripe Webhook Patterns

Padrões e best practices para implementação robusta de webhooks Stripe.

## 🎯 Core Principles

1. **Idempotência**: Processar o mesmo evento múltiplas vezes deve ter o mesmo resultado
2. **Atomicidade**: Usar transactions para operações
3. **Segurança**: Sempre validar signatures
4. **Resiliência**: Nunca falhar permanentemente (retry logic)
5. **Auditoria**: Log tudo para debugging

## 🔐 Signature Verification

### Pattern 1: Basic Verification

```typescript
import { stripe } from '@/core/stripe'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body = await req.text() // IMPORTANTE: raw body!
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Invalid signature:', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Process event...
}
```

### Pattern 2: Custom Verification

```typescript
import crypto from 'crypto'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const parts = signature.split(',')
  const timestamp = parts[0].split('=')[1]
  const expectedSignature = parts[1].split('=')[1]

  const signedPayload = `${timestamp}.${body}`
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(expectedSignature)
  )
}
```

### Pattern 3: Timestamp Validation

```typescript
function verifyTimestamp(signature: string, toleranceSeconds: number = 300) {
  const timestamp = parseInt(signature.split(',')[0].split('=')[1])
  const now = Math.floor(Date.now() / 1000)

  if (now - timestamp > toleranceSeconds) {
    throw new Error('Signature timestamp too old')
  }
}
```

## 🔄 Idempotency Patterns

### Pattern 1: Database-based (Recomendado)

```typescript
import { db } from '@/core/db'
import { purchases } from '@/core/db/schema'
import { eq } from 'drizzle-orm'

export async function processPayment(session: Stripe.Checkout.Session) {
  const sessionId = session.id

  await db.transaction(async (tx) => {
    // Check if already processed
    const existing = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, sessionId))
      .limit(1)

    if (existing.length > 0) {
      console.log('Already processed:', sessionId)
      return // Idempotent return
    }

    // Process payment...
    await tx.insert(purchases).values({ /* ... */ })
  })
}
```

### Pattern 2: Event ID Tracking

```typescript
// Schema
export const processedEvents = pgTable('processed_events', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').unique().notNull(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at').defaultNow(),
})

// Handler
export async function handleWebhook(event: Stripe.Event) {
  await db.transaction(async (tx) => {
    // Check if event already processed
    const existing = await tx
      .select()
      .from(processedEvents)
      .where(eq(processedEvents.eventId, event.id))
      .limit(1)

    if (existing.length > 0) {
      return // Already processed
    }

    // Process event
    await processEvent(event, tx)

    // Mark as processed
    await tx.insert(processedEvents).values({
      eventId: event.id,
      eventType: event.type,
    })
  })
}
```

### Pattern 3: Optimistic Locking

```typescript
// Schema com version field
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  credits: integer('credits').default(0),
  version: integer('version').default(0), // Optimistic lock
})

// Update com version check
export async function addCredits(userId: number, credits: number) {
  await db.transaction(async (tx) => {
    const user = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user[0]) throw new Error('User not found')

    const result = await tx
      .update(users)
      .set({
        credits: user[0].credits + credits,
        version: user[0].version + 1,
      })
      .where(
        and(
          eq(users.id, userId),
          eq(users.version, user[0].version) // Check version
        )
      )

    if (result.rowCount === 0) {
      throw new Error('Concurrent modification detected')
    }
  })
}
```

## 🔒 Transaction Patterns

### Pattern 1: Simple Transaction

```typescript
await db.transaction(async (tx) => {
  // All operations atomic
  await tx.insert(purchases).values({ /* ... */ })
  await tx.update(users).set({ credits: user.credits + 100 })
})
```

### Pattern 2: Pessimistic Locking

```typescript
await db.transaction(async (tx) => {
  // Lock row for update
  const user = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for('update') // PostgreSQL row lock
    .limit(1)

  // Safe to update
  await tx.update(users).set({ credits: user[0].credits + 100 })
})
```

### Pattern 3: Rollback on Error

```typescript
try {
  await db.transaction(async (tx) => {
    await tx.insert(purchases).values({ /* ... */ })
    await tx.update(users).set({ credits: newCredits })

    // Simulate business logic error
    if (newCredits < 0) {
      throw new Error('Invalid credits')
    }
  })
} catch (error) {
  console.error('Transaction rolled back:', error)
  // DB state unchanged
}
```

## 🎭 Event Handling Patterns

### Pattern 1: Event Router

```typescript
export async function POST(req: NextRequest) {
  const event = await verifyWebhook(req)

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      default:
        console.log(`Unhandled event: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Event processing failed:', error)
    // Return 200 to prevent infinite retries
    return NextResponse.json({ received: true })
  }
}
```

### Pattern 2: Handler Registry

```typescript
type EventHandler<T> = (data: T) => Promise<void>

const eventHandlers = new Map<string, EventHandler<any>>([
  ['checkout.session.completed', handleCheckoutCompleted],
  ['payment_intent.succeeded', handlePaymentSucceeded],
  ['payment_intent.payment_failed', handlePaymentFailed],
])

export async function POST(req: NextRequest) {
  const event = await verifyWebhook(req)

  const handler = eventHandlers.get(event.type)

  if (handler) {
    try {
      await handler(event.data.object)
    } catch (error) {
      console.error(`Handler failed for ${event.type}:`, error)
    }
  } else {
    console.log(`No handler for ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
```

### Pattern 3: Dead Letter Queue

```typescript
// Schema
export const failedWebhooks = pgTable('failed_webhooks', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  error: text('error'),
  attempts: integer('attempts').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

// Handler
export async function POST(req: NextRequest) {
  const event = await verifyWebhook(req)

  try {
    await processEvent(event)
  } catch (error) {
    // Add to dead letter queue
    await db.insert(failedWebhooks).values({
      eventId: event.id,
      eventType: event.type,
      payload: event as any,
      error: error instanceof Error ? error.message : 'Unknown error',
      attempts: 1,
    })

    console.error('Event failed, added to DLQ:', event.id)
  }

  // Always return 200
  return NextResponse.json({ received: true })
}
```

## 🔁 Retry Patterns

### Pattern 1: Exponential Backoff

```typescript
async function processWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      const delay = Math.min(1000 * 2 ** attempt, 10000) // Max 10s
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// Usage
await processWithRetry(() => processPayment(session), 3)
```

### Pattern 2: Stripe Built-in Retries

Stripe automaticamente retria webhooks. Configurar retry logic:

```typescript
// Stripe retries automatically with exponential backoff:
// - Immediately
// - After 1 hour
// - After 3 hours
// - After 6 hours
// - After 12 hours
// - After 24 hours

// Para prevenir retries infinitos, SEMPRE retorne 200:
export async function POST(req: NextRequest) {
  try {
    await processEvent(event)
  } catch (error) {
    // Log error mas retorne 200
    console.error('Processing failed:', error)
  }

  return NextResponse.json({ received: true }) // SEMPRE 200
}
```

### Pattern 3: Manual Retry Queue

```typescript
// Processar failed events manualmente
export async function retryFailedWebhooks() {
  const failed = await db
    .select()
    .from(failedWebhooks)
    .where(lt(failedWebhooks.attempts, 5))
    .limit(10)

  for (const item of failed) {
    try {
      await processEvent(item.payload as Stripe.Event)

      // Success - delete from queue
      await db.delete(failedWebhooks).where(eq(failedWebhooks.id, item.id))
    } catch (error) {
      // Increment attempts
      await db
        .update(failedWebhooks)
        .set({ attempts: item.attempts + 1 })
        .where(eq(failedWebhooks.id, item.id))
    }
  }
}

// Rodar via cron job
// cron: 0 * * * * (a cada hora)
```

## 📊 Audit Log Pattern

```typescript
// Schema
export const webhookAuditLog = pgTable('webhook_audit_log', {
  id: serial('id').primaryKey(),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  userId: integer('user_id'),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  result: text('result'), // 'success' | 'failed'
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
})

// Log function
async function logWebhook(params: {
  eventId: string
  eventType: string
  userId?: number
  action: string
  payload?: any
  result: 'success' | 'failed'
  error?: string
}) {
  await db.insert(webhookAuditLog).values(params)
}

// Usage
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = parseInt(session.metadata!.userId)

  try {
    await processPayment(session)

    await logWebhook({
      eventId: session.id,
      eventType: 'checkout.session.completed',
      userId,
      action: 'credits_added',
      payload: { credits: session.metadata!.credits },
      result: 'success',
    })
  } catch (error) {
    await logWebhook({
      eventId: session.id,
      eventType: 'checkout.session.completed',
      userId,
      action: 'credits_added',
      result: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw error
  }
}
```

## ⚠️ Common Gotchas

### 1. Raw Body Required

```typescript
// ❌ WRONG
const body = await req.json() // Parsed body breaks signature

// ✅ CORRECT
const body = await req.text() // Raw body for signature
```

### 2. Always Return 200

```typescript
// ❌ WRONG - Stripe will retry infinitely
if (error) {
  return NextResponse.json({ error }, { status: 500 })
}

// ✅ CORRECT - Log error and return 200
if (error) {
  console.error('Processing failed:', error)
  await addToDeadLetterQueue(event)
  return NextResponse.json({ received: true }) // 200
}
```

### 3. Idempotency is Critical

```typescript
// ❌ WRONG - Can process twice
await addCredits(userId, 100)

// ✅ CORRECT - Check first
const existing = await getPurchase(sessionId)
if (!existing) {
  await addCredits(userId, 100)
}
```

### 4. Use Transactions

```typescript
// ❌ WRONG - Not atomic
await createPurchase(data)
await addCredits(userId, credits)

// ✅ CORRECT - Atomic
await db.transaction(async (tx) => {
  await tx.insert(purchases).values(data)
  await tx.update(users).set({ credits })
})
```

## 🎯 Testing Patterns

### Local Testing

```bash
# Start webhook forwarding
stripe listen --forward-to localhost:3000/api/billing/webhook

# Trigger specific event
stripe trigger checkout.session.completed

# Trigger with metadata
stripe trigger checkout.session.completed \
  --add checkout_session:metadata[userId]=1 \
  --add checkout_session:metadata[credits]=100
```

### Integration Test

```typescript
describe('Webhook Handler', () => {
  it('should process checkout.session.completed', async () => {
    const mockSession = {
      id: 'cs_test_123',
      amount_total: 999,
      metadata: { userId: '1', credits: '100' },
    } as any

    await handleCheckoutCompleted(mockSession)

    const user = await getUser(1)
    expect(user.credits).toBe(100)
  })

  it('should be idempotent', async () => {
    const mockSession = { /* ... */ } as any

    await handleCheckoutCompleted(mockSession)
    await handleCheckoutCompleted(mockSession) // Second time

    const purchases = await getPurchases('cs_test_123')
    expect(purchases).toHaveLength(1) // Only one purchase
  })
})
```

## 📚 Resources

- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Testing Webhooks](https://stripe.com/docs/webhooks/test)
