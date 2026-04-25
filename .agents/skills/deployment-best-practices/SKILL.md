---
name: deployment-best-practices
description: Best practices para deployment de aplicações de chat incluindo Vercel deployment, environment variables, database migrations, monitoring, error tracking, CI/CD, secrets management e production checklist.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 5
  tags: [deployment, vercel, cicd, monitoring, production, devops]
  compatible_with: [antigravity, windsurf, opencode]
---

# Deployment Best Practices

Guia completo de deployment para aplicações de chat Next.js.

## 🎯 Objetivo

Fornecer:
- **Vercel deployment** setup
- **Environment variables** management
- **Database migrations** strategy
- **Monitoring & logging** (Sentry, Vercel Analytics)
- **CI/CD pipelines** (GitHub Actions)
- **Secrets management** (Vercel, 1Password)
- **Production checklist**

## Use this skill when

- Deploying to production
- Setting up CI/CD
- Configuring monitoring
- Managing secrets
- Running migrations
- Troubleshooting production issues

## Quick Reference

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Set environment variables
vercel env add OPENAI_API_KEY
vercel env add DATABASE_URL
```

### Environment Variables

```bash
# .env.local (development)
DATABASE_URL=postgresql://localhost:5432/mydb
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# .env.production (via Vercel dashboard)
DATABASE_URL=postgresql://prod.example.com/mydb
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Database Migrations

```typescript
// scripts/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function runMigrations() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  const db = drizzle(sql)

  console.log('Running migrations...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations complete')

  await sql.end()
}

runMigrations()
```

## 🚀 Deployment Patterns

### Pattern 1: GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### Pattern 2: Error Tracking (Sentry)

```typescript
// core/sentry.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
})

// Use in error boundaries
export function logError(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, { extra: context })
}
```

### Pattern 3: Health Check

```typescript
// app/api/health/route.ts
// ⚠️ Público: retorna APENAS status (sem detalhes de infraestrutura)
import { NextResponse } from 'next/server'
import { db } from '@/core/db'

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    // ❌ NUNCA expor error.message (pode conter connection strings, etc.)
    return NextResponse.json({ status: 'unhealthy' }, { status: 500 })
  }
}

// app/api/health/detailed/route.ts
// 🔒 Protegido: detalhes apenas para admin autenticado
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/core/auth'
import { db } from '@/core/db'

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await db.execute(sql`SELECT 1`)
    const stripeStatus = await checkStripe()
    const openaiStatus = await checkOpenAI()

    return NextResponse.json({
      status: 'healthy',
      database: 'ok',
      stripe: stripeStatus,
      openai: openaiStatus,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: (error as Error).message },
      { status: 500 }
    )
  }
}
```

## ✅ Production Checklist

### Environment

- [ ] All environment variables set in Vercel
- [ ] Database connection string (production)
- [ ] API keys (OpenAI, Anthropic, Stripe)
- [ ] Webhook secrets configured
- [ ] Error tracking (Sentry) configured
- [ ] Analytics (Vercel, PostHog) enabled

### Security

- [ ] HTTPS enabled (automatic on Vercel)
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (use Drizzle)
- [ ] XSS protection (sanitize user input)
- [ ] CSRF protection

### Performance

- [ ] Database indexes created
- [ ] Caching strategy implemented
- [ ] Image optimization enabled
- [ ] Bundle size optimized (<500KB)
- [ ] Lighthouse score >90

### Monitoring

- [ ] Error tracking (Sentry)
- [ ] Performance monitoring (Vercel Analytics)
- [ ] Uptime monitoring (UptimeRobot, Better Stack)
- [ ] Log aggregation (Vercel Logs)
- [ ] Alerts configured (errors, downtime)

### Database

- [ ] Migrations run successfully
- [ ] Backups configured (automatic)
- [ ] Connection pooling enabled
- [ ] Indexes created
- [ ] Constraints validated

### Testing

- [ ] All tests passing
- [ ] E2E tests for critical flows
- [ ] Load testing performed
- [ ] Security audit completed

## 📖 Resources

- [Deployment Guide](./resources/deployment-guide.md)
- [Production Checklist](./resources/production-checklist.md)

## 🔗 Links Úteis

- [Vercel Docs](https://vercel.com/docs)
- [Sentry Docs](https://docs.sentry.io)
- [GitHub Actions](https://docs.github.com/en/actions)
