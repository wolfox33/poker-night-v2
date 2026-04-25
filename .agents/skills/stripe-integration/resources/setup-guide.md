# Stripe Integration Setup Guide

Guia passo-a-passo para configurar integração Stripe em projeto SaaS com sistema de créditos.

## 📋 Pre-requisitos

- Conta Stripe (usar test mode inicialmente)
- Next.js 16+ project
- PostgreSQL database
- Drizzle ORM configurado
- Better Auth instalado

## 🚀 Setup Passo-a-Passo

### 1. Criar Conta Stripe

1. Acessar [stripe.com](https://stripe.com)
2. Criar conta
3. **Permanecer em Test Mode** durante desenvolvimento

### 2. Obter API Keys

1. Dashboard → Developers → API keys
2. Copiar **Publishable key** (`pk_test_...`)
3. Copiar **Secret key** (`sk_test_...`)
4. **Nunca** commitar estas keys!

### 3. Configurar Environment Variables

```bash
# .env.local
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=  # Será preenchido depois

# Produção
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Adicionar ao `.env.example`:
```bash
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

### 4. Instalar Dependencies

```bash
npm install stripe
# ou
pnpm add stripe
```

### 5. Criar Stripe Client

```typescript
// core/stripe.ts
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
})
```

### 6. Criar Database Schema

```typescript
// core/db/schema.ts
import { pgTable, serial, integer, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  credits: integer('credits').default(0).notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  credits: integer('credits').notNull(),
  amount: integer('amount').notNull(), // cents
  currency: text('currency').default('usd').notNull(),
  stripeCheckoutSessionId: text('stripe_checkout_session_id').unique().notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  status: text('status', { enum: ['pending', 'completed', 'failed'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
})
```

### 7. Rodar Migrations

```bash
# Gerar migration
npx drizzle-kit generate

# Aplicar migration
npx drizzle-kit migrate
```

### 8. Criar Produtos no Stripe Dashboard

1. Dashboard → Products → Add product
2. Criar pacotes de créditos:

| Nome | Créditos | Preço (USD) |
|------|----------|-------------|
| Starter Pack | 50 | $4.99 |
| Popular Pack | 100 | $9.99 |
| Pro Pack | 500 | $39.99 |

3. Para cada produto:
   - Name: ex "100 Credits"
   - Description: "100 message credits for Agent Chat"
   - Pricing: One-time payment
   - Price: $9.99 USD
   - Add metadata: `credits: 100`

4. Copiar **Price ID** de cada produto (`price_xxx`)

### 9. Implementar Checkout Service

```typescript
// features/billing/service/create-checkout.ts
import { stripe } from '@/core/stripe'
import { db } from '@/core/db'
import { users } from '@/core/db/schema'
import { eq } from 'drizzle-orm'

interface CreateCheckoutParams {
  userId: number
  credits: number
  priceId: string
  successUrl: string
  cancelUrl: string
}

export async function createCheckout(params: CreateCheckoutParams) {
  const { userId, credits, priceId, successUrl, cancelUrl } = params

  // Get or create Stripe customer
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user[0]) throw new Error('User not found')

  let customerId = user[0].stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user[0].email,
      metadata: { userId: userId.toString() },
    })
    customerId = customer.id

    await db
      .update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, userId))
  }

  // Create checkout session
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

  return {
    sessionId: session.id,
    url: session.url,
  }
}
```

### 10. Implementar Checkout API Route

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
    // Authenticate
    const session = await auth.api.getSession({ headers: req.headers })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate input
    const body = await req.json()
    const { priceId, credits } = checkoutSchema.parse(body)

    // Create checkout
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
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
```

### 11. Implementar Process Payment Service

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
  const amount = session.amount_total!
  const paymentIntentId = session.payment_intent as string

  await db.transaction(async (tx) => {
    // Check idempotency
    const existing = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, checkoutSessionId))
      .limit(1)

    if (existing.length > 0) {
      console.log('Payment already processed:', checkoutSessionId)
      return
    }

    // Create purchase record
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

    // Add credits to user
    const user = await tx.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user[0]) {
      throw new Error(`User ${userId} not found`)
    }

    await tx
      .update(users)
      .set({ credits: (user[0].credits || 0) + credits })
      .where(eq(users.id, userId))

    console.log(`Added ${credits} credits to user ${userId}. New balance: ${(user[0].credits || 0) + credits}`)
  })
}
```

### 12. Implementar Webhook API Route

```typescript
// app/api/billing/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/core/stripe'
import { processPayment } from '@/features/billing/service/process-payment'
import Stripe from 'stripe'

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
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session
        await processPayment(session)
        break

      case 'payment_intent.payment_failed':
        console.error('Payment failed:', event.data.object.id)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ received: true })
  }
}
```

### 13. Configurar Webhooks Localmente

```bash
# Instalar Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git && scoop install stripe
# Linux: https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks para localhost
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copiar o webhook secret exibido e adicionar ao `.env.local`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 14. Testar Fluxo Completo

```bash
# Terminal 1: Rodar app
npm run dev

# Terminal 2: Stripe CLI listening
stripe listen --forward-to localhost:3000/api/billing/webhook

# Terminal 3: Trigger evento
stripe trigger checkout.session.completed
```

## ✅ Checklist de Validação

- [ ] Stripe keys configuradas em `.env.local`
- [ ] Database schema criado e migrado
- [ ] Stripe client funcionando
- [ ] Produtos criados no Stripe Dashboard
- [ ] Checkout session cria corretamente
- [ ] Webhook endpoint responde 200
- [ ] Webhook signature validation funciona
- [ ] Payment idempotency funciona (não duplica)
- [ ] Créditos são adicionados corretamente
- [ ] Purchase record é criado
- [ ] Stripe CLI consegue triggerar eventos

## 🔐 Security Checklist

- [ ] API keys NÃO estão no código
- [ ] `.env.local` está no `.gitignore`
- [ ] Webhook signature é validada
- [ ] Database transactions são usadas
- [ ] Idempotency está implementada
- [ ] Input validation (Zod) está implementada
- [ ] Erro handling não expõe detalhes sensíveis

## 🎯 Next Steps

1. Implementar frontend (Pricing page + Checkout button)
2. Adicionar Customer Portal
3. Adicionar analytics/monitoring
4. Setup produção (live keys + webhook endpoint)
5. Adicionar email notifications
6. Implementar refunds (se necessário)

## 📚 Resources

- [Stripe Docs](https://stripe.com/docs)
- [Checkout Sessions](https://stripe.com/docs/payments/checkout)
- [Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
