# Stripe Integration Testing Guide

Guia completo para testar integração Stripe em diferentes níveis: unit, integration e E2E.

## 🎯 Test Strategy

```
┌─────────────────────────────────────┐
│ E2E Tests (Playwright)              │
│ - Full checkout flow                │
│ - Real Stripe Test Mode             │
├─────────────────────────────────────┤
│ Integration Tests (Vitest)          │
│ - Webhook handling                  │
│ - Database operations               │
│ - Stripe CLI events                 │
├─────────────────────────────────────┤
│ Unit Tests (Vitest)                 │
│ - Business logic                    │
│ - Validation                        │
│ - Mocked Stripe                     │
└─────────────────────────────────────┘
```

## 🧪 Unit Tests

### Setup

```typescript
// lib/test-utils/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest'
import { db } from '@/core/db'

beforeAll(async () => {
  // Setup test database
  await db.execute('BEGIN')
})

afterEach(async () => {
  // Rollback each test
  await db.execute('ROLLBACK')
  await db.execute('BEGIN')
})

afterAll(async () => {
  await db.execute('ROLLBACK')
})
```

### Mock Stripe

```typescript
// lib/test-utils/mock-stripe.ts
import { vi } from 'vitest'
import type Stripe from 'stripe'

export const mockStripe = {
  customers: {
    create: vi.fn().mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
    }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      }),
    },
  },
  webhooks: {
    constructEvent: vi.fn((body, sig, secret) => {
      return JSON.parse(body) as Stripe.Event
    }),
  },
}

vi.mock('@/core/stripe', () => ({
  stripe: mockStripe,
}))
```

### Test Create Checkout

```typescript
// features/billing/service/create-checkout.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createCheckout } from '@/features/billing/service/create-checkout'
import { db } from '@/core/db'
import { users } from '@/core/db/schema'
import { mockStripe } from '@/lib/test-utils/mock-stripe'

describe('createCheckout', () => {
  beforeEach(() => {
    mockStripe.customers.create.mockClear()
    mockStripe.checkout.sessions.create.mockClear()
  })

  it('should create checkout session for new customer', async () => {
    // Setup
    await db.insert(users).values({
      id: 1,
      email: 'test@example.com',
      credits: 0,
    })

    // Execute
    const result = await createCheckout({
      userId: 1,
      credits: 100,
      priceId: 'price_test',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
    })

    // Assert
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      metadata: { userId: '1' },
    })

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test_123',
        mode: 'payment',
        metadata: {
          userId: '1',
          credits: '100',
        },
      })
    )

    expect(result.sessionId).toBe('cs_test_123')
    expect(result.url).toBe('https://checkout.stripe.com/test')
  })

  it('should reuse existing stripe customer', async () => {
    // Setup - User com Stripe customer já criado
    await db.insert(users).values({
      id: 2,
      email: 'existing@example.com',
      credits: 50,
      stripeCustomerId: 'cus_existing',
    })

    // Execute
    await createCheckout({
      userId: 2,
      credits: 100,
      priceId: 'price_test',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
    })

    // Assert - Não deve criar novo customer
    expect(mockStripe.customers.create).not.toHaveBeenCalled()

    // Deve usar customer existente
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing',
      })
    )
  })

  it('should throw error if user not found', async () => {
    await expect(
      createCheckout({
        userId: 999,
        credits: 100,
        priceId: 'price_test',
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      })
    ).rejects.toThrow('User not found')
  })
})
```

### Test Process Payment

```typescript
// features/billing/service/process-payment.test.ts
import { describe, it, expect } from 'vitest'
import { processPayment } from '@/features/billing/service/process-payment'
import { db } from '@/core/db'
import { users, purchases } from '@/core/db/schema'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'

describe('processPayment', () => {
  it('should process payment and add credits', async () => {
    // Setup
    await db.insert(users).values({
      id: 1,
      email: 'test@example.com',
      credits: 10,
    })

    const mockSession: Partial<Stripe.Checkout.Session> = {
      id: 'cs_test_123',
      amount_total: 999,
      currency: 'usd',
      payment_intent: 'pi_test_123',
      metadata: {
        userId: '1',
        credits: '100',
      },
    }

    // Execute
    await processPayment(mockSession as Stripe.Checkout.Session)

    // Assert - Credits added
    const user = await db.select().from(users).where(eq(users.id, 1)).limit(1)
    expect(user[0].credits).toBe(110) // 10 + 100

    // Assert - Purchase created
    const purchase = await db
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, 'cs_test_123'))
      .limit(1)

    expect(purchase[0]).toBeDefined()
    expect(purchase[0].userId).toBe(1)
    expect(purchase[0].credits).toBe(100)
    expect(purchase[0].amount).toBe(999)
    expect(purchase[0].status).toBe('completed')
  })

  it('should be idempotent - not process same session twice', async () => {
    // Setup
    await db.insert(users).values({
      id: 1,
      email: 'test@example.com',
      credits: 10,
    })

    const mockSession: Partial<Stripe.Checkout.Session> = {
      id: 'cs_test_456',
      amount_total: 999,
      currency: 'usd',
      payment_intent: 'pi_test_456',
      metadata: { userId: '1', credits: '100' },
    }

    // Execute - First time
    await processPayment(mockSession as Stripe.Checkout.Session)

    const userAfterFirst = await db.select().from(users).where(eq(users.id, 1)).limit(1)
    expect(userAfterFirst[0].credits).toBe(110)

    // Execute - Second time (should be ignored)
    await processPayment(mockSession as Stripe.Checkout.Session)

    const userAfterSecond = await db.select().from(users).where(eq(users.id, 1)).limit(1)
    expect(userAfterSecond[0].credits).toBe(110) // Unchanged!

    // Only one purchase record
    const allPurchases = await db
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, 'cs_test_456'))

    expect(allPurchases).toHaveLength(1)
  })

  it('should rollback on error', async () => {
    // Setup - User NÃO existe
    const mockSession: Partial<Stripe.Checkout.Session> = {
      id: 'cs_test_789',
      amount_total: 999,
      currency: 'usd',
      payment_intent: 'pi_test_789',
      metadata: { userId: '999', credits: '100' },
    }

    // Execute - Should throw
    await expect(
      processPayment(mockSession as Stripe.Checkout.Session)
    ).rejects.toThrow('User 999 not found')

    // Assert - No purchase created (rollback)
    const purchase = await db
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, 'cs_test_789'))

    expect(purchase).toHaveLength(0)
  })
})
```

## 🔗 Integration Tests

### Test with Stripe CLI

```typescript
// features/billing/api/webhook.test.ts
import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/billing/webhook/route'
import { db } from '@/core/db'
import { users, purchases } from '@/core/db/schema'
import { eq } from 'drizzle-orm'

describe('Webhook Integration', () => {
  it('should handle checkout.session.completed event', async () => {
    // Setup user
    await db.insert(users).values({
      id: 1,
      email: 'test@example.com',
      credits: 0,
    })

    // Mock webhook event
    const event = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          amount_total: 999,
          currency: 'usd',
          payment_intent: 'pi_test_123',
          metadata: {
            userId: '1',
            credits: '100',
          },
        },
      },
    }

    const body = JSON.stringify(event)
    const signature = 't=123,v1=test_signature'

    // Mock request
    const request = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': signature,
      },
      body,
    })

    // Execute
    const response = await POST(request as any)

    // Assert
    expect(response.status).toBe(200)

    const user = await db.select().from(users).where(eq(users.id, 1)).limit(1)
    expect(user[0].credits).toBe(100)

    const purchase = await db
      .select()
      .from(purchases)
      .where(eq(purchases.stripeCheckoutSessionId, 'cs_test_123'))
      .limit(1)

    expect(purchase[0]).toBeDefined()
  })
})
```

### Manual Testing with Stripe CLI

```bash
# Terminal 1: Run app
npm run dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:3000/api/billing/webhook

# Terminal 3: Trigger eventos
# Checkout completed
stripe trigger checkout.session.completed \
  --add checkout_session:metadata[userId]=1 \
  --add checkout_session:metadata[credits]=100

# Payment succeeded
stripe trigger payment_intent.succeeded

# Payment failed
stripe trigger payment_intent.payment_failed
```

## 🌐 E2E Tests

### Playwright Setup

```typescript
// e2e/billing.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Billing Flow', () => {
  test.use({
    storageState: 'e2e/.auth/user.json', // Authenticated state
  })

  test('should complete checkout flow', async ({ page }) => {
    // Navigate to pricing page
    await page.goto('/pricing')

    // Click buy button
    await page.click('button:has-text("Buy 100 Credits")')

    // Should redirect to Stripe Checkout
    await expect(page).toHaveURL(/checkout\.stripe\.com/)

    // Fill card info (usar test cards)
    await page.fill('[name="cardnumber"]', '4242 4242 4242 4242')
    await page.fill('[name="exp-date"]', '12/34')
    await page.fill('[name="cvc"]', '123')
    await page.fill('[name="postal"]', '12345')

    // Submit payment
    await page.click('button:has-text("Pay")')

    // Should redirect back to success URL
    await expect(page).toHaveURL(/\/dashboard\?checkout=success/)

    // Verify credits updated
    await expect(page.locator('text=/Credits: \\d+/')).toBeVisible()
  })

  test('should cancel checkout', async ({ page }) => {
    await page.goto('/pricing')
    await page.click('button:has-text("Buy 100 Credits")')

    // Click back button em Stripe Checkout
    await page.click('[aria-label="Back"]')

    await expect(page).toHaveURL(/\/pricing\?checkout=cancel/)
  })
})
```

### Test Cards

```typescript
// Usa test cards do Stripe
const TEST_CARDS = {
  SUCCESS: '4242 4242 4242 4242',
  DECLINE: '4000 0000 0000 0002',
  INSUFFICIENT_FUNDS: '4000 0000 0000 9995',
  EXPIRED_CARD: '4000 0000 0000 0069',
  PROCESSING_ERROR: '4000 0000 0000 0119',
  REQUIRE_3DS: '4000 0027 6000 3184',
}
```

## 📊 Test Coverage

### Generate Coverage Report

```bash
# Run tests with coverage
npm run test:coverage

# Open coverage report
open coverage/index.html
```

### Coverage Targets

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      },
      "features/billing": {
        "branches": 90,
        "functions": 90,
        "lines": 90,
        "statements": 90
      }
    }
  }
}
```

## 🔍 Testing Checklist

### Unit Tests
- [ ] Create checkout session
- [ ] Reuse existing Stripe customer
- [ ] Process payment and add credits
- [ ] Idempotency (don't process twice)
- [ ] Transaction rollback on error
- [ ] Handle invalid user ID
- [ ] Handle missing metadata

### Integration Tests
- [ ] Webhook signature validation
- [ ] Handle checkout.session.completed
- [ ] Handle payment_intent.succeeded
- [ ] Handle payment_intent.payment_failed
- [ ] Concurrent payment processing
- [ ] Database transaction atomicity

### E2E Tests
- [ ] Complete checkout flow
- [ ] Cancel checkout
- [ ] Credits updated after payment
- [ ] Error handling (declined card)
- [ ] 3D Secure flow

## 🐛 Debugging Tests

### Enable Logging

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    silent: false, // Enable console.log
  },
})
```

### Debug Individual Test

```bash
# Run single test file
npm test create-checkout.test.ts

# Run with debug output
npm test -- --reporter=verbose

# Run in watch mode
npm test -- --watch
```

### Inspect Database State

```typescript
it('should add credits', async () => {
  await processPayment(mockSession)

  // Inspect database
  const allUsers = await db.select().from(users)
  console.log('Users:', allUsers)

  const allPurchases = await db.select().from(purchases)
  console.log('Purchases:', allPurchases)
})
```

## 📚 Resources

- [Stripe Testing](https://stripe.com/docs/testing)
- [Test Cards](https://stripe.com/docs/testing#cards)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)
- [Playwright Docs](https://playwright.dev)
