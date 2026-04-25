---
name: stripe-integration
description: Best practices de integração do Stripe para sistemas de créditos SaaS. Cobre setup, checkout sessions, webhook handling com idempotência, customer portal, testing com Stripe CLI, error handling e security. Integração com Better Auth, Next.js 16 e Drizzle ORM.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 5
  tags: [stripe, payments, webhooks, saas, credits, billing]
  compatible_with: [antigravity, windsurf, opencode]
---

# Stripe Integration Best Practices

Guia completo de integração do Stripe para sistemas de créditos em aplicações SaaS, com foco em robustez, idempotência e segurança.

## 🎯 Objetivo

Fornecer:
- **Setup correto** do Stripe em projetos SaaS
- **Padrões de checkout** para venda de créditos
- **Webhook handling** com idempotência
- **Integração** com Better Auth e Drizzle
- **Testing** com Stripe CLI
- **Error handling** e retry logic
- **Security** best practices

## Use this skill when

- Implementando sistema de pagamentos em SaaS
- Configurando venda de créditos/pacotes
- Integrando Stripe webhooks
- Debugando problemas de pagamento
- Configurando Stripe Customer Portal
- Implementando sistema de billing
- Testando fluxos de pagamento

## Do not use this skill when

- Projeto não precisa de pagamentos
- Usa outro gateway (PayPal, Mercado Pago, etc.)
- Não usa sistema de créditos (apenas subscriptions simples)
- Projeto muito simples sem backend

## Instructions

1. **Setup inicial**: Instalar SDK Stripe e configurar API keys
2. **Configurar produtos**: Criar produtos e prices no Stripe Dashboard
3. **Implementar checkout**: Criar checkout sessions para compra de créditos
4. **Configurar webhooks**: Setup endpoint e validação de signatures
5. **Implementar idempotência**: Prevenir processamento duplicado
6. **Integrar com DB**: Persistir purchases e atualizar créditos
7. **Testar localmente**: Usar Stripe CLI para simular webhooks
8. **Customer Portal**: Permitir usuários gerenciar billing

Consulte `resources/setup-guide.md` para guia passo-a-passo, `resources/webhook-patterns.md` para implementação de webhooks e `resources/testing-guide.md` para testes.

## Safety

- **Nunca** commitar API keys
- **Sempre** validar webhook signatures
- **Implementar** idempotency keys
- **Usar** database transactions
- **Validar** amounts antes de processar
- **Log** todas as transações
- **Implementar** rate limiting em endpoints
- **Usar** HTTPS em produção

## 📚 Quick Reference

### Environment Variables

```bash
# Obrigatórias
STRIPE_SECRET_KEY="sk_test_..."  # Test key
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Produção
STRIPE_SECRET_KEY="sk_live_..."  # Live key
STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

**⚠️ Nunca usar live keys em desenvolvimento!**

### Stripe CLI Commands

```bash
# Login
stripe login

# Listen to webhooks (forward to localhost)
stripe listen --forward-to localhost:3000/api/billing/webhook

# Trigger events manualmente
stripe trigger payment_intent.succeeded
stripe trigger checkout.session.completed

# Ver logs
stripe logs tail
```

### Produtos e Preços

Criar no Stripe Dashboard ou via API:

```bash
# Criar produto
stripe products create --name="100 Credits" --description="100 message credits"

# Criar price
stripe prices create \
  --product=prod_xxx \
  --unit-amount=999 \
  --currency=usd
```

## 🔧 Core Setup

### 1. Instalação

```bash
npm install stripe
# ou
pnpm add stripe
```

### 2. Cliente Stripe

```typescript
// core/stripe.ts
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia', // Usar versão mais recente
  typescript: true,
})
```

### 3. Database Schema (Drizzle)

```typescript
// core/db/schema.ts
import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  credits: integer('credits').default(0).notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  credits: integer('credits').notNull(),
  amount: integer('amount').notNull(), // cents
  currency: text('currency').default('usd').notNull(),
  stripeCheckoutSessionId: text('stripe_checkout_session_id').unique().notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  status: text('status').notNull(), // 'pending' | 'completed' | 'failed'
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
})
```

## 💳 Checkout Implementation

### Criar Checkout Session

```typescript
// features/billing/service/create-checkout.ts
import { stripe } from '@/core/stripe'
import { db } from '@/core/db'
import { users } from '@/core/db/schema'
import { eq } from 'drizzle-orm'

interface CreateCheckoutParams {
  userId: number
  credits: number
  priceId: string // Stripe Price ID
  successUrl: string
  cancelUrl: string
}

export async function createCheckout({
  userId,
  credits,
  priceId,
  successUrl,
  cancelUrl,
}: CreateCheckoutParams) {
  // Buscar ou criar Stripe customer
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user[0]) throw new Error('User not found')

  let customerId = user[0].stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user[0].email,
      metadata: { userId: userId.toString() },
    })
    customerId = customer.id

    // Salvar customer ID
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId))
  }

  // Criar checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: userId.toString(),
      credits: credits.toString(),
    },
  })

  return { sessionId: session.id, url: session.url }
}
```

### API Route (Next.js 16)

```typescript
// app/api/billing/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/core/auth'
import { createCheckout } from '@/features/billing/service/create-checkout'
import { z } from 'zod'

const checkoutSchema = z.object({
  priceId: z.string(),
  credits: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  try {
    // Autenticar
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validar input
    const body = await req.json()
    const { priceId, credits } = checkoutSchema.parse(body)

    // Criar checkout
    const { sessionId, url } = await createCheckout({
      userId: session.user.id,
      credits,
      priceId,
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?checkout=cancel`,
    })

    return NextResponse.json({ sessionId, url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
```

## 🪝 Webhook Implementation

### Webhook Handler

```typescript
// app/api/billing/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/core/stripe'
import { processPayment } from '@/features/billing/service/process-payment'
import Stripe from 'stripe'

// ⚠️ IMPORTANTE: Disable body parsing para raw body
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    // Verificar signature
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Processar evento
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session
        await processPayment(session)
        break

      case 'payment_intent.succeeded':
        // Opcional: log adicional
        console.log('Payment succeeded:', event.data.object.id)
        break

      case 'payment_intent.payment_failed':
        // Opcional: notificar usuário
        console.error('Payment failed:', event.data.object.id)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    // ⚠️ Retornar 200 mesmo com erro para evitar retry infinito
    // Log error para investigar depois
    return NextResponse.json({ received: true })
  }
}
```

### Process Payment (com Idempotência)

```typescript
// features/billing/service/process-payment.ts
import { db } from '@/core/db'
import { users, purchases } from '@/core/db/schema'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'

export async function processPayment(session: Stripe.Checkout.Session) {
  const checkoutSessionId = session.id
  const userId = parseInt(session.metadata!.userId)
  const credits = parseInt(session.metadata!.credits)
  const amount = session.amount_total! // cents
  const paymentIntentId = session.payment_intent as string

  // Usar transaction para atomicidade
  await db.transaction(async (tx) => {
    // 1. Verificar idempotência
    const existing = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, checkoutSessionId))
      .limit(1)

    if (existing.length > 0) {
      console.log('Payment already processed:', checkoutSessionId)
      return // Já processado
    }

    // 2. Criar purchase record
    await tx.insert(purchases).values({
      userId,
      credits,
      amount,
      currency: session.currency || 'usd',
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: paymentIntentId,
      status: 'completed',
      completedAt: new Date(),
    })

    // 3. Adicionar créditos ao usuário
    const user = await tx.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user[0]) {
      throw new Error(`User ${userId} not found`)
    }

    await tx
      .update(users)
      .set({ credits: (user[0].credits || 0) + credits })
      .where(eq(users.id, userId))

    console.log(`Added ${credits} credits to user ${userId}`)
  })
}
```

## 🧪 Testing

### Local Testing com Stripe CLI

```bash
# 1. Instalar Stripe CLI
# https://stripe.com/docs/stripe-cli

# 2. Login
stripe login

# 3. Forward webhooks
stripe listen --forward-to localhost:3000/api/billing/webhook

# 4. Copiar webhook secret e adicionar ao .env.local
# STRIPE_WEBHOOK_SECRET=whsec_...

# 5. Trigger evento de teste
stripe trigger checkout.session.completed
```

### Integration Test

```typescript
// features/billing/service/checkout.test.ts
import { createCheckout } from '@/features/billing/service/create-checkout'
import { processPayment } from '@/features/billing/service/process-payment'
import { db } from '@/core/db'
import { users, purchases } from '@/core/db/schema'
import { eq } from 'drizzle-orm'

describe('Billing Flow', () => {
  it('should create checkout session', async () => {
    const userId = 1
    const credits = 100

    const { sessionId, url } = await createCheckout({
      userId,
      credits,
      priceId: 'price_test',
      successUrl: 'http://localhost:3000/success',
      cancelUrl: 'http://localhost:3000/cancel',
    })

    expect(sessionId).toBeDefined()
    expect(url).toContain('checkout.stripe.com')
  })

  it('should process payment and add credits', async () => {
    const userId = 1
    const initialCredits = 10

    // Setup
    await db.insert(users).values({ id: userId, email: 'test@example.com', credits: initialCredits })

    // Mock Stripe session
    const mockSession = {
      id: 'cs_test_123',
      amount_total: 999,
      currency: 'usd',
      payment_intent: 'pi_test_123',
      metadata: {
        userId: userId.toString(),
        credits: '100',
      },
    } as any

    // Process payment
    await processPayment(mockSession)

    // Verify credits added
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    expect(user[0].credits).toBe(initialCredits + 100)

    // Verify purchase created
    const purchase = await db
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, 'cs_test_123'))
      .limit(1)

    expect(purchase[0]).toBeDefined()
    expect(purchase[0].status).toBe('completed')
  })

  it('should be idempotent - not process same checkout twice', async () => {
    const mockSession = {
      id: 'cs_test_456',
      amount_total: 999,
      currency: 'usd',
      payment_intent: 'pi_test_456',
      metadata: { userId: '1', credits: '100' },
    } as any

    // Process first time
    await processPayment(mockSession)

    const userAfterFirst = await db.select().from(users).where(eq(users.id, 1)).limit(1)
    const creditsAfterFirst = userAfterFirst[0].credits

    // Process second time (should be ignored)
    await processPayment(mockSession)

    const userAfterSecond = await db.select().from(users).where(eq(users.id, 1)).limit(1)
    expect(userAfterSecond[0].credits).toBe(creditsAfterFirst) // Unchanged
  })
})
```

## 🔐 Security Best Practices

### 1. Validar Webhook Signatures

```typescript
// SEMPRE verificar signature
event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
```

### 2. Idempotency

```typescript
// Verificar se já processou antes de executar
const existing = await db.select().from(purchases).where(eq(purchases.stripeCheckoutSessionId, sessionId))
if (existing.length > 0) return
```

### 3. Database Transactions

```typescript
// SEMPRE usar transactions para operações atômicas
await db.transaction(async (tx) => {
  // Create purchase + update credits atomically
})
```

### 4. Validation

```typescript
// Validar amounts
if (session.amount_total !== expectedAmount) {
  throw new Error('Amount mismatch')
}

// Validar metadata
if (!session.metadata?.userId) {
  throw new Error('Missing userId in metadata')
}
```

### 5. Error Handling

```typescript
try {
  await processPayment(session)
} catch (error) {
  // Log error mas retornar 200 para evitar retry infinito
  console.error('Payment processing failed:', error)
  // Adicionar a dead letter queue para retry manual
  await addToDeadLetterQueue(session)
  return NextResponse.json({ received: true })
}
```

## 📊 Monitoring

### Logs Essenciais

```typescript
console.log('Checkout created:', { userId, sessionId, credits })
console.log('Payment processing:', { sessionId, userId, credits, amount })
console.log('Payment completed:', { userId, newBalance: user.credits })
console.error('Payment failed:', { sessionId, error })
```

### Stripe Dashboard

- **Payments**: Monitorar sucesso/falhas
- **Webhooks**: Ver eventos e retries
- **Customers**: Ver histórico de compras

### Alertas

- Taxa de falha de pagamentos > 5%
- Webhooks com retry > 3x
- Discrepância entre Stripe e DB

## ⚠️ Common Gotchas

### 1. Raw Body para Webhooks

Next.js parseia body por default. Precisa desabilitar:

```typescript
// Usar req.text() ao invés de req.json()
const body = await req.text()
```

### 2. Webhook Secret Diferente

Test e Live modes têm secrets diferentes:

```bash
# Test
STRIPE_WEBHOOK_SECRET=whsec_test_...

# Live
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Customer ID Persistence

Salvar `stripeCustomerId` no DB para reusar:

```typescript
if (!user.stripeCustomerId) {
  const customer = await stripe.customers.create({ email: user.email })
  await db.update(users).set({ stripeCustomerId: customer.id })
}
```

### 4. Retries Infinitos

Webhook failing → Stripe retries → Failing again → Loop

**Solução**: Sempre retornar 200, mesmo com erro. Log e investigar depois.

## 🎯 Alinhamento com Arquitetura

### Vertical Slice Structure

```
src/features/billing/
├── api/
│   ├── checkout.ts          # POST /api/billing/checkout
│   └── webhook.ts            # POST /api/billing/webhook
├── service/
│   ├── create-checkout.ts   # Business logic
│   └── process-payment.ts   # Business logic
├── repo/
│   └── purchases.ts          # Data access
└── components/
    └── PricingCard.tsx       # UI
```

### Integração com Better Auth

```typescript
// Usar Better Auth para auth
const session = await auth.api.getSession({ headers: req.headers })
const userId = session.user.id
```

### Integração com Credits Feature

```typescript
// billing chama credits.service para debitar
import { debitCredits } from '@/features/credits/service/debit-credits'
await debitCredits(userId, 1) // Ao enviar mensagem
```

## 📖 Resources

- [Setup Guide](./resources/setup-guide.md) - Guia passo-a-passo
- [Webhook Patterns](./resources/webhook-patterns.md) - Padrões de webhooks
- [Testing Guide](./resources/testing-guide.md) - Testes completos

## 🔗 Links Úteis

- [Stripe Docs](https://stripe.com/docs)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)
- [Security Best Practices](https://stripe.com/docs/security/best-practices)
