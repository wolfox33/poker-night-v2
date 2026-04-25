# Transaction Patterns

Padrões de implementação de database transactions para operações de créditos.

## 🎯 ACID Properties

Transactions garantem **ACID**:
- **Atomicity**: Tudo ou nada
- **Consistency**: DB sempre em estado válido
- **Isolation**: Transactions não interferem entre si
- **Durability**: Mudanças persistem após commit

## 🔒 Locking Strategies

### Pessimistic Locking

**Quando usar**: High contention, critical operations

**Vantagens**:
- Garante sucesso (sem retries)
- Previne conflicts

**Desvantagens**:
- Slower (locks)
- Pode causar deadlocks

```typescript
await db.transaction(async (tx) => {
  // Lock row - outros txs esperam
  const user = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for('update') // SELECT ... FOR UPDATE
    .limit(1)

  // Safe to update (locked)
  await tx
    .update(users)
    .set({ credits: user[0].credits - amount })
    .where(eq(users.id, userId))
})
```

### Optimistic Locking

**Quando usar**: Low contention, read-heavy

**Vantagens**:
- Faster (no locks)
- Better concurrency

**Desvantagens**:
- Requires retries
- Can fail under high contention

```typescript
// Add version column
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  credits: integer('credits').default(0),
  version: integer('version').default(0),
})

// Update with version check
await db.transaction(async (tx) => {
  const user = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const currentVersion = user[0].version

  const result = await tx
    .update(users)
    .set({
      credits: user[0].credits - amount,
      version: currentVersion + 1, // Increment
    })
    .where(
      and(
        eq(users.id, userId),
        eq(users.version, currentVersion) // Check version
      )
    )

  if (result.rowCount === 0) {
    throw new Error('Concurrent modification')
  }
})
```

## 🔄 Idempotency Patterns

### Pattern 1: Idempotency Key

```typescript
export async function debitWithIdempotency(
  userId: number,
  amount: number,
  idempotencyKey: string
) {
  return await db.transaction(async (tx) => {
    // Check if already processed
    const existing = await tx
      .select()
      .from(creditLog)
      .where(eq(creditLog.idempotencyKey, idempotencyKey))
      .limit(1)

    if (existing.length > 0) {
      console.log('Already processed:', idempotencyKey)
      return existing[0] // Return previous result
    }

    // Process operation...
    const user = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
      .limit(1)

    if (user[0].credits < amount) {
      throw new InsufficientCreditsError(user[0].credits, amount)
    }

    await tx
      .update(users)
      .set({ credits: user[0].credits - amount })
      .where(eq(users.id, userId))

    // Log with idempotency key
    const [log] = await tx
      .insert(creditLog)
      .values({
        userId,
        amount: -amount,
        balanceBefore: user[0].credits,
        balanceAfter: user[0].credits - amount,
        operation: 'debit',
        idempotencyKey, // Store key
      })
      .returning()

    return log
  })
}
```

### Pattern 2: Natural Key Idempotency

```typescript
// Use combination of userId + operation + timestamp as natural key
export async function debitForMessage(
  userId: number,
  conversationId: number,
  messageId: number
) {
  const idempotencyKey = `debit_${userId}_${conversationId}_${messageId}`

  return await debitWithIdempotency(userId, 1, idempotencyKey)
}
```

## 🛡️ Race Condition Prevention

### Problem: Double Debit

```typescript
// ❌ WRONG: Race condition possible
const balance = await getBalance(userId) // Read 1
if (balance >= 1) {
  await updateBalance(userId, balance - 1) // Write might be outdated
}

// If two requests run simultaneously:
// Request A: reads balance = 5
// Request B: reads balance = 5
// Request A: writes balance = 4
// Request B: writes balance = 4  ← WRONG! Should be 3
```

### Solution: Atomic Update

```typescript
// ✅ CORRECT: Transaction with lock
await db.transaction(async (tx) => {
  const user = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for('update') // Lock prevents concurrent access
    .limit(1)

  if (user[0].credits < 1) {
    throw new InsufficientCreditsError()
  }

  await tx
    .update(users)
    .set({ credits: user[0].credits - 1 })
    .where(eq(users.id, userId))
})
```

## 🔁 Retry Logic

### Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isRetriable =
        error.message === 'Concurrent modification' ||
        error.code === '40001' // Serialization failure

      if (!isRetriable || attempt === maxRetries - 1) {
        throw error
      }

      const delay = Math.min(baseDelay * 2 ** attempt, 5000)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw new Error('Max retries exceeded')
}

// Usage
await withRetry(() => debitCreditsOptimistic(userId, 1, 'message'))
```

## 🎯 Validation Patterns

### Pre-flight Check

```typescript
export async function canAfford(userId: number, amount: number) {
  const balance = await getBalance(userId)
  return balance >= amount
}

// Use before expensive operations
const canProceed = await canAfford(userId, 1)
if (!canProceed) {
  return { error: 'Insufficient credits' }
}

// Process...
await debitCredits(userId, 1, 'operation')
```

### Validation Inside Transaction

```typescript
await db.transaction(async (tx) => {
  const user = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for('update')
    .limit(1)

  // Validate
  if (user[0].credits < amount) {
    throw new InsufficientCreditsError(user[0].credits, amount)
  }

  if (amount <= 0) {
    throw new Error('Amount must be positive')
  }

  if (amount > 1000) {
    throw new Error('Amount exceeds maximum')
  }

  // Update...
})
```

## 🔄 Rollback Patterns

### Automatic Rollback on Error

```typescript
try {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ credits: user.credits - 100 })
      .where(eq(users.id, userId))

    // Simulate error
    throw new Error('Payment failed')

    // This never executes
    await tx.insert(purchases).values({ userId, credits: 100 })
  })
} catch (error) {
  // Transaction automatically rolled back
  console.error('Transaction failed:', error)
  // User credits unchanged
}
```

### Manual Rollback

```typescript
await db.transaction(async (tx) => {
  await debitCredits(userId, 1, tx)

  try {
    await sendMessage(userId, content)
  } catch (error) {
    // Manually refund on failure
    await addCredits(userId, 1, 'refund_failed_message', tx)
    throw error
  }
})
```

## 📊 Nested Transactions

Drizzle não suporta nested transactions diretamente, mas podemos simular com savepoints:

```typescript
await db.transaction(async (tx) => {
  // Outer transaction
  await tx.insert(users).values({ email: 'test@example.com' })

  try {
    // Simulated nested transaction
    await tx.execute(sql`SAVEPOINT sp1`)

    await tx.insert(purchases).values({ userId: 1, credits: 100 })

    // Rollback to savepoint on error
    throw new Error('Something went wrong')
  } catch (error) {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT sp1`)
  }

  // Outer transaction continues
  await tx.insert(creditLog).values({ userId: 1, amount: 100 })
})
```

## ⚠️ Common Gotchas

### 1. Forgetting Locks

```typescript
// ❌ WRONG: Race condition
await db.transaction(async (tx) => {
  const user = await tx.select().from(users).where(eq(users.id, userId))
  // Another tx can modify user here!
  await tx.update(users).set({ credits: user[0].credits - 1 })
})

// ✅ CORRECT: Lock row
await db.transaction(async (tx) => {
  const user = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for('update') // Lock!
  await tx.update(users).set({ credits: user[0].credits - 1 })
})
```

### 2. Long Transactions

```typescript
// ❌ WRONG: Holding lock too long
await db.transaction(async (tx) => {
  const user = await tx.select().from(users).for('update')

  // Expensive operation while holding lock!
  await callExternalAPI() // 5 seconds
  await processImage() // 10 seconds

  await tx.update(users).set({ credits: user[0].credits - 1 })
})

// ✅ CORRECT: Do expensive work outside tx
const result = await callExternalAPI()
const processed = await processImage()

await db.transaction(async (tx) => {
  const user = await tx.select().from(users).for('update')
  await tx.update(users).set({ credits: user[0].credits - 1 })
})
```

### 3. Not Handling Errors

```typescript
// ❌ WRONG: Swallow errors
await db.transaction(async (tx) => {
  try {
    await debitCredits(userId, 1)
  } catch (error) {
    console.log('Error:', error) // Lost context
  }
})

// ✅ CORRECT: Propagate errors
await db.transaction(async (tx) => {
  try {
    await debitCredits(userId, 1)
  } catch (error) {
    console.error('Debit failed:', error)
    throw error // Re-throw to rollback
  }
})
```

## 🧪 Testing

### Test Race Conditions

```typescript
describe('Race Conditions', () => {
  it('should handle concurrent debits correctly', async () => {
    // Setup user with 10 credits
    await db.insert(users).values({ id: 1, credits: 10 })

    // Simulate 15 concurrent debits
    const operations = Array(15)
      .fill(null)
      .map(() => debitCredits(1, 1, 'test'))

    // Some should succeed, some should fail
    const results = await Promise.allSettled(operations)

    const successful = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length

    expect(successful).toBe(10) // Only 10 should succeed
    expect(failed).toBe(5) // 5 should fail (insufficient credits)

    // Final balance should be 0
    const user = await db.select().from(users).where(eq(users.id, 1))
    expect(user[0].credits).toBe(0)
  })
})
```

## 📚 Best Practices

1. **Always use transactions** for credit operations
2. **Lock rows** when modifying (pessimistic) or use version checks (optimistic)
3. **Validate** before modifying
4. **Log** all operations for audit
5. **Handle errors** properly (rollback)
6. **Keep transactions short** - do expensive work outside
7. **Use idempotency keys** to prevent duplicates
8. **Test** concurrent scenarios

## 🔗 Resources

- [PostgreSQL Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [Drizzle Transactions](https://orm.drizzle.team/docs/transactions)
- [Row Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
