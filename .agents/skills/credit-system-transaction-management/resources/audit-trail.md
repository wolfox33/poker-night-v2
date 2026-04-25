# Audit Trail Implementation

Guia completo para implementar audit trail robusto de operações de créditos.

## 🎯 Por que Audit Trail?

**Benefícios**:
- **Compliance**: Regulations financeiras exigem
- **Debugging**: Rastrear problemas
- **Reconciliation**: Verificar consistência
- **Analytics**: Entender uso
- **Dispute Resolution**: Resolver conflitos
- **Security**: Detectar fraude

## 📊 Schema Design

### Basic Audit Log

```typescript
export const creditLog = pgTable('credit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  amount: integer('amount').notNull(), // + for credit, - for debit
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  operation: text('operation', { enum: ['credit', 'debit'] }).notNull(),
  reason: text('reason').notNull(),
  metadata: jsonb('metadata'),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

// Indexes for common queries
export const creditLogIndexes = {
  userIdIdx: index('credit_log_user_id_idx').on(creditLog.userId),
  createdAtIdx: index('credit_log_created_at_idx').on(creditLog.createdAt),
  reasonIdx: index('credit_log_reason_idx').on(creditLog.reason),
}
```

### Advanced Audit Log

```typescript
export const creditAuditLog = pgTable('credit_audit_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Transaction details
  amount: integer('amount').notNull(),
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  operation: text('operation', { enum: ['credit', 'debit'] }).notNull(),
  reason: text('reason').notNull(),
  
  // Context
  conversationId: integer('conversation_id'),
  purchaseId: integer('purchase_id'),
  metadata: jsonb('metadata'),
  
  // Idempotency
  idempotencyKey: text('idempotency_key').unique(),
  
  // Audit fields
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  requestId: text('request_id'),
  
  // Who/when
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by'), // Admin user if manual operation
})
```

## 📝 Logging Operations

### Log Debit

```typescript
export async function logDebit(
  userId: number,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  reason: string,
  metadata?: Record<string, any>,
  tx?: any
) {
  const db = tx || db

  await db.insert(creditLog).values({
    userId,
    amount: -amount, // Negative for debit
    balanceBefore,
    balanceAfter,
    operation: 'debit',
    reason,
    metadata,
  })
}
```

### Log Credit

```typescript
export async function logCredit(
  userId: number,
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  reason: string,
  metadata?: Record<string, any>,
  tx?: any
) {
  const db = tx || db

  await db.insert(creditLog).values({
    userId,
    amount, // Positive for credit
    balanceBefore,
    balanceAfter,
    operation: 'credit',
    reason,
    metadata,
  })
}
```

### Atomic Logging

```typescript
export async function debitWithLogging(
  userId: number,
  amount: number,
  reason: string,
  metadata?: Record<string, any>
) {
  return await db.transaction(async (tx) => {
    // Get current balance (with lock)
    const user = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
      .limit(1)

    if (!user[0]) throw new Error('User not found')

    const balanceBefore = user[0].credits

    if (balanceBefore < amount) {
      throw new InsufficientCreditsError(balanceBefore, amount)
    }

    const balanceAfter = balanceBefore - amount

    // Update balance
    await tx
      .update(users)
      .set({ credits: balanceAfter })
      .where(eq(users.id, userId))

    // Log operation (atomic with update)
    const [log] = await tx
      .insert(creditLog)
      .values({
        userId,
        amount: -amount,
        balanceBefore,
        balanceAfter,
        operation: 'debit',
        reason,
        metadata,
      })
      .returning()

    return log
  })
}
```

## 🔍 Querying Audit Log

### Get User History

```typescript
export async function getUserHistory(
  userId: number,
  limit: number = 50,
  offset: number = 0
) {
  const history = await db
    .select()
    .from(creditLog)
    .where(eq(creditLog.userId, userId))
    .orderBy(desc(creditLog.createdAt))
    .limit(limit)
    .offset(offset)

  return history
}
```

### Filter by Operation

```typescript
export async function getOperations(
  userId: number,
  operation: 'credit' | 'debit',
  limit: number = 50
) {
  const logs = await db
    .select()
    .from(creditLog)
    .where(
      and(
        eq(creditLog.userId, userId),
        eq(creditLog.operation, operation)
      )
    )
    .orderBy(desc(creditLog.createdAt))
    .limit(limit)

  return logs
}
```

### Filter by Reason

```typescript
export async function getLogsByReason(
  userId: number,
  reason: string,
  limit: number = 50
) {
  const logs = await db
    .select()
    .from(creditLog)
    .where(
      and(
        eq(creditLog.userId, userId),
        eq(creditLog.reason, reason)
      )
    )
    .orderBy(desc(creditLog.createdAt))
    .limit(limit)

  return logs
}
```

### Date Range Query

```typescript
export async function getLogsInRange(
  userId: number,
  startDate: Date,
  endDate: Date
) {
  const logs = await db
    .select()
    .from(creditLog)
    .where(
      and(
        eq(creditLog.userId, userId),
        gte(creditLog.createdAt, startDate),
        lte(creditLog.createdAt, endDate)
      )
    )
    .orderBy(desc(creditLog.createdAt))

  return logs
}
```

## 📊 Analytics & Reports

### Total Credits/Debits

```typescript
export async function getTotals(userId: number, days: number = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const result = await db
    .select({
      totalCredits: sql<number>`SUM(CASE WHEN ${creditLog.amount} > 0 THEN ${creditLog.amount} ELSE 0 END)`,
      totalDebits: sql<number>`SUM(CASE WHEN ${creditLog.amount} < 0 THEN ABS(${creditLog.amount}) ELSE 0 END)`,
      netChange: sql<number>`SUM(${creditLog.amount})`,
      transactionCount: sql<number>`COUNT(*)`,
    })
    .from(creditLog)
    .where(
      and(
        eq(creditLog.userId, userId),
        gte(creditLog.createdAt, cutoffDate)
      )
    )

  return result[0]
}
```

### Daily Summary

```typescript
export async function getDailySummary(userId: number, days: number = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const summary = await db
    .select({
      date: sql<string>`DATE(${creditLog.createdAt})`,
      credits: sql<number>`SUM(CASE WHEN ${creditLog.amount} > 0 THEN ${creditLog.amount} ELSE 0 END)`,
      debits: sql<number>`SUM(CASE WHEN ${creditLog.amount} < 0 THEN ABS(${creditLog.amount}) ELSE 0 END)`,
      net: sql<number>`SUM(${creditLog.amount})`,
      transactions: sql<number>`COUNT(*)`,
    })
    .from(creditLog)
    .where(
      and(
        eq(creditLog.userId, userId),
        gte(creditLog.createdAt, cutoffDate)
      )
    )
    .groupBy(sql`DATE(${creditLog.createdAt})`)
    .orderBy(sql`DATE(${creditLog.createdAt}) DESC`)

  return summary
}
```

### Breakdown by Reason

```typescript
export async function getReasonBreakdown(userId: number, days: number = 30) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const breakdown = await db
    .select({
      reason: creditLog.reason,
      count: sql<number>`COUNT(*)`,
      totalAmount: sql<number>`SUM(${creditLog.amount})`,
    })
    .from(creditLog)
    .where(
      and(
        eq(creditLog.userId, userId),
        gte(creditLog.createdAt, cutoffDate)
      )
    )
    .groupBy(creditLog.reason)
    .orderBy(desc(sql`COUNT(*)`))

  return breakdown
}
```

## 🔐 Balance Reconciliation

### Calculate Expected Balance

```typescript
export async function calculateExpectedBalance(userId: number) {
  const logs = await db
    .select()
    .from(creditLog)
    .where(eq(creditLog.userId, userId))

  const calculatedBalance = logs.reduce((sum, log) => sum + log.amount, 0)

  return calculatedBalance
}
```

### Reconcile Balance

```typescript
export async function reconcileUserBalance(userId: number) {
  const expected = await calculateExpectedBalance(userId)
  const actual = await getBalance(userId)

  const isReconciled = expected === actual

  if (!isReconciled) {
    console.error('Balance mismatch!', {
      userId,
      expected,
      actual,
      difference: actual - expected,
    })

    // Optional: Auto-fix or alert
    await alertBalanceDiscrepancy(userId, expected, actual)
  }

  return {
    reconciled: isReconciled,
    expected,
    actual,
    difference: actual - expected,
  }
}
```

### Bulk Reconciliation

```typescript
export async function reconcileAllBalances() {
  const users = await db.select({ id: users.id }).from(users)

  const results = []

  for (const user of users) {
    const result = await reconcileUserBalance(user.id)
    results.push({ userId: user.id, ...result })
  }

  const discrepancies = results.filter((r) => !r.reconciled)

  if (discrepancies.length > 0) {
    console.error(`Found ${discrepancies.length} balance discrepancies`)
    // Send alert
  }

  return results
}

// Run via cron job daily
// 0 3 * * * (3 AM daily)
```

## 🗑️ Retention & Archival

### Archive Old Logs

```typescript
export const archivedCreditLog = pgTable('archived_credit_log', {
  // Same schema as creditLog
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  amount: integer('amount').notNull(),
  // ... all fields
  archivedAt: timestamp('archived_at').defaultNow(),
})

export async function archiveOldLogs(daysOld: number = 365) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  // Copy to archive
  await db.execute(sql`
    INSERT INTO archived_credit_log 
    SELECT *, NOW() as archived_at 
    FROM credit_log 
    WHERE created_at < ${cutoffDate}
  `)

  // Delete from main table
  const result = await db
    .delete(creditLog)
    .where(lt(creditLog.createdAt, cutoffDate))

  console.log(`Archived ${result.rowCount} old logs`)

  return result.rowCount
}
```

### Aggregate Historical Data

```typescript
export const monthlyAggregates = pgTable('monthly_credit_aggregates', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  totalCredits: integer('total_credits').notNull(),
  totalDebits: integer('total_debits').notNull(),
  netChange: integer('net_change').notNull(),
  transactionCount: integer('transaction_count').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export async function aggregateMonthlyData(year: number, month: number) {
  const result = await db.execute(sql`
    INSERT INTO monthly_credit_aggregates (user_id, year, month, total_credits, total_debits, net_change, transaction_count)
    SELECT 
      user_id,
      ${year},
      ${month},
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END),
      SUM(amount),
      COUNT(*)
    FROM credit_log
    WHERE 
      EXTRACT(YEAR FROM created_at) = ${year} AND
      EXTRACT(MONTH FROM created_at) = ${month}
    GROUP BY user_id
    ON CONFLICT (user_id, year, month) DO UPDATE
    SET 
      total_credits = EXCLUDED.total_credits,
      total_debits = EXCLUDED.total_debits,
      net_change = EXCLUDED.net_change,
      transaction_count = EXCLUDED.transaction_count
  `)

  return result
}
```

## 🧪 Testing

### Test Audit Completeness

```typescript
describe('Audit Trail', () => {
  it('should log all credit operations', async () => {
    const userId = 1

    // Perform operations
    await addCredits(userId, 100, 'purchase')
    await debitCredits(userId, 10, 'message')
    await debitCredits(userId, 5, 'message')

    // Check logs
    const logs = await getUserHistory(userId)

    expect(logs).toHaveLength(3)
    expect(logs[0].amount).toBe(-5)
    expect(logs[1].amount).toBe(-10)
    expect(logs[2].amount).toBe(100)
  })

  it('should maintain balance consistency', async () => {
    const userId = 1

    await addCredits(userId, 100, 'initial')
    await debitCredits(userId, 30, 'test')
    await addCredits(userId, 50, 'bonus')

    const { reconciled, expected, actual } = await reconcileUserBalance(userId)

    expect(reconciled).toBe(true)
    expect(expected).toBe(120) // 100 - 30 + 50
    expect(actual).toBe(120)
  })
})
```

## 📚 Best Practices

1. **Log atomically** with the operation (same transaction)
2. **Include context** (metadata, reason, etc.)
3. **Store balances** before/after for easy reconciliation
4. **Index strategically** for common queries
5. **Reconcile regularly** to catch discrepancies
6. **Archive old data** to keep table performant
7. **Aggregate historical** data for faster reporting
8. **Never delete** audit logs (archive instead)

## 🔗 Resources

- [Audit Logging Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Database Auditing](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Time-series Data](https://www.timescale.com/blog/time-series-data-postgresql-10-vs-timescaledb-816/)
