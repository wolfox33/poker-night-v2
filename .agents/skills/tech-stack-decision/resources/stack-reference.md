# Stack Reference - Detalhamento Completo

Referência detalhada de todas as tecnologias da stack padrão com justificativas, features e considerações.

## Frontend Technologies

### Bun (Runtime) - v1.3.9+

**O que é:**
Runtime JavaScript/TypeScript alternativo ao Node.js, focado em performance e DX.

**Por que usar:**
- ⚡ **3-4x mais rápido** que npm/pnpm para install
- 🚀 **Bundler integrado** (mais rápido que Webpack/esbuild)
- 🧪 **Test runner nativo** (compatível com Jest)
- 📦 **Package manager** integrado
- 🔧 **TypeScript nativo** (sem configuração)

**Quando NÃO usar:**
- Projeto legado com dependências Node-specific
- CI/CD não suporta Bun ainda
- Bibliotecas nativas (C++) incompatíveis

**Instalação:**
```bash
# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# Linux/Mac
curl -fsSL https://bun.sh/install | bash
```

**Comandos:**
```bash
bun install          # Instalar dependências
bun run dev          # Rodar script
bun test             # Rodar testes
bun build            # Build para produção
```

---

### Next.js - v16.0.10+

**O que é:**
Framework React full-stack com SSR, SSG, ISR e App Router.

**Features principais (v16):**
- 🚀 **Turbopack** como bundler default (5-10x mais rápido)
- ⚛️ **React 19** support
- 🎨 **Partial Pre-Rendering (PPR)**
- 🔄 **`use cache` directive** para caching granular
- 📊 **React Compiler** estável
- 🌐 **View Transitions API**

**Por que usar:**
- DX excelente (hot reload instantâneo)
- SEO-friendly (SSR/SSG)
- File-based routing
- API routes integradas
- Deployment fácil (Vercel)

**Estrutura recomendada:**
```
app/
├── (auth)/
│   ├── login/
│   └── signup/
├── (dashboard)/
│   ├── layout.tsx
│   └── page.tsx
├── api/
│   └── [...routes]/
├── layout.tsx
└── page.tsx
```

**Configuração (next.config.ts):**
```typescript
import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    ppr: true,  // Partial Pre-Rendering
    reactCompiler: true,  // React Compiler
  },
  turbopack: {
    // Turbopack config
  },
}

export default config
```

---

### Tailwind CSS - v4.0+

**O que é:**
Framework CSS utility-first com engine reescrita em Rust.

**Mudanças v4:**
- ⚡ **10x mais rápido** (engine em Rust)
- 🎨 **CSS-first** config (não mais JS)
- 🔧 **Zero config** para começar
- 📦 **Menor bundle** size
- 🎯 **Melhor IntelliSense**

**Por que usar:**
- Desenvolvimento rápido
- Design system consistente
- Purge automático (CSS mínimo)
- Customização total

**Setup (v4):**
```bash
bun add tailwindcss@next @tailwindcss/postcss@next
```

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-primary: #3b82f6;
  --color-secondary: #8b5cf6;
  --font-sans: 'Inter', sans-serif;
}
```

**Não precisa mais de:**
- `tailwind.config.js` (opcional)
- `postcss.config.js` (automático)

---

### shadcn/ui

**O que é:**
Coleção de componentes React copiáveis (não é biblioteca).

**Por que usar:**
- 🎨 **Customizável** (você possui o código)
- 🔧 **Sem dependência** (copia componentes)
- 🎯 **Acessível** (ARIA compliant)
- 🌗 **Dark mode** nativo
- 📦 **Tailwind-based**

**Setup:**
```bash
bunx shadcn@latest init
bunx shadcn@latest add button
bunx shadcn@latest add dialog
```

**Uso:**
```tsx
import { Button } from '@/components/ui/button'

export function MyComponent() {
  return <Button variant="default">Click me</Button>
}
```

---

### Better Auth - v1.4.18+

**O que é:**
Framework de autenticação TypeScript-first para Next.js.

**Features:**
- 🔐 Email/Password, OAuth, Magic Link
- 🔑 Session management
- 👥 Multi-tenant support
- 🛡️ CSRF protection
- 📱 2FA/MFA
- 🏢 Organizations

**Por que usar:**
- TypeScript nativo (type-safe)
- Integração perfeita com Next.js
- Flexível e extensível
- Sem vendor lock-in

**Setup:**
```typescript
// core/auth.ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db'

export const auth = betterAuth({
  database: drizzleAdapter(db),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
})
```

---

## Backend Technologies

### Python - v3.12+

**Por que 3.12:**
- 🚀 **15% mais rápido** que 3.11
- 🔧 **Melhor error messages**
- 📊 **Type hints** aprimorados
- 🧪 **Per-interpreter GIL** (experimental)

**Instalação:**
```bash
# Windows
winget install Python.Python.3.12

# Linux
sudo apt install python3.12

# Mac
brew install python@3.12
```

---

### FastAPI - v0.129.0+

**O que é:**
Framework web moderno para APIs com Python.

**Features:**
- ⚡ **Async nativo** (ASGI)
- 📚 **Auto docs** (Swagger/ReDoc)
- ✅ **Validação** automática (Pydantic)
- 🔧 **Type hints** nativos
- 🚀 **Performance** comparável a Node/Go

**Por que usar:**
- DX excelente
- Documentação automática
- Type safety
- Async/await nativo
- Comunidade grande

**Exemplo:**
```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

@app.post("/items/")
async def create_item(item: Item):
    return {"name": item.name, "price": item.price}
```

---

### LangGraph - v1.0+

**O que é:**
Framework para construir agentes AI com state management.

**Features (v1.0):**
- 🔄 **State management** robusto
- 🌳 **Graph-based** workflows
- 💾 **Checkpointing** (persistência)
- 🔁 **Human-in-the-loop**
- 🎯 **Conditional edges**
- 🔧 **Debugging** tools

**Por que usar:**
- Production-ready (v1.0 stable)
- State management automático
- Workflows complexos
- Persistência nativa
- Debugging excelente

**Exemplo:**
```python
from langgraph.graph import StateGraph
from langgraph.checkpoint.postgres import PostgresSaver

# Define state
class AgentState(TypedDict):
    messages: list[str]
    context: dict

# Create graph
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("agent", agent_node)
workflow.add_node("tools", tools_node)

# Add edges
workflow.add_edge("agent", "tools")
workflow.add_conditional_edges("tools", should_continue)

# Compile with checkpointing
checkpointer = PostgresSaver.from_conn_string(DATABASE_URL)
app = workflow.compile(checkpointer=checkpointer)
```

---

## Database & ORM

### PostgreSQL - v16+

**Features v16:**
- 🚀 **Performance** melhorada (20-30% em queries)
- 📊 **JSON** performance boost
- 🔍 **Parallel queries** aprimoradas
- 🔐 **Security** enhancements

**Por que usar:**
- ACID compliant
- JSON/JSONB nativo
- Full-text search
- Extensões (PostGIS, pgvector)
- Replicação robusta

**Setup (Docker):**
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

### Drizzle ORM - v0.45.1+

**O que é:**
ORM TypeScript lightweight e type-safe.

**Por que usar:**
- 🎯 **Type-safe** (100% inferência)
- 🪶 **Lightweight** (sem overhead)
- 🚀 **Performance** (queries otimizadas)
- 🔧 **SQL-like** syntax
- 📦 **Tree-shakeable**

**vs Prisma:**
| Feature | Drizzle | Prisma |
|---------|---------|--------|
| Type Safety | ✅ | ✅ |
| Performance | ⚡⚡⚡ | ⚡⚡ |
| Bundle Size | 🪶 Tiny | 📦 Large |
| SQL Control | ✅ Full | ⚠️ Limited |
| Learning Curve | 📈 Moderate | 📉 Easy |

**Exemplo:**
```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import postgres from 'postgres'

// Schema
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
})

// Client
const client = postgres(DATABASE_URL)
export const db = drizzle(client)

// Query (fully typed!)
const allUsers = await db.select().from(users)
const user = await db.select().from(users).where(eq(users.id, 1))
```

---

## Testing

### Playwright

**Por que usar:**
- 🌐 **Multi-browser** (Chromium, Firefox, WebKit)
- 🚀 **Rápido** (paralelo por default)
- 🎯 **Auto-wait** (sem sleeps)
- 📸 **Screenshots/videos** automáticos
- 🔧 **Debugging** excelente

**Setup:**
```bash
bun add -D @playwright/test
bunx playwright install
```

---

### Vitest

**Por que usar:**
- ⚡ **Rápido** (Vite-powered)
- 🔧 **Compatível** com Jest
- 🎯 **Watch mode** inteligente
- 📊 **Coverage** nativo
- 🧪 **UI mode** para debugging

**Setup:**
```bash
bun add -D vitest
```

---

## Quando Atualizar Versões

### Atualizar Imediatamente
- **Security patches** (ex: 16.0.10 → 16.0.11)
- **Bug fixes críticos**

### Atualizar em Semanas
- **Minor versions** (ex: 1.4.18 → 1.5.0)
- **Features não-breaking**

### Avaliar Cuidadosamente
- **Major versions** (ex: 15.x → 16.x)
- **Breaking changes**
- **Reescritas** (ex: Tailwind v3 → v4)

### Nunca Atualizar Cegamente
- **Beta/Canary** em produção
- **Sem ler changelog**
- **Sem testar**
