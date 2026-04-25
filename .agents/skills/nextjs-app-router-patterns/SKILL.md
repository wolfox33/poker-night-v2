---
name: nextjs-app-router-patterns
description: Best practices para Next.js 16 App Router incluindo Server Components, Client Components, Server Actions, Route Handlers, Streaming, Suspense boundaries, error handling, loading states e data fetching patterns.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 5
  tags: [nextjs, react, server-components, app-router, streaming, suspense]
  compatible_with: [antigravity, windsurf, opencode]
---

# Next.js App Router Patterns

Guia completo de patterns e best practices para Next.js 16 App Router.

## 🎯 Objetivo

Fornecer:
- **Server vs Client Components** quando usar cada um
- **Server Actions** patterns
- **Route Handlers** for APIs
- **Streaming & Suspense** for performance
- **Error boundaries** e loading states
- **Data fetching** strategies
- **Caching** patterns

## Use this skill when

- Construindo aplicação Next.js
- Decidindo Server vs Client Component
- Implementing data fetching
- Streaming UI progressivamente
- Handling errors robustamente
- Optimizing performance
- Building API routes

## Do not use this skill when

- Usando Next.js Pages Router (legacy)
- SPA puro sem SSR
- Framework diferente (Remix, etc.)

## Instructions

1. **Choose component type**: Server (default) vs Client (when needed)
2. **Implement data fetching**: async Server Components + caching
3. **Add streaming**: Suspense boundaries para progressive rendering
4. **Error handling**: error.tsx + error boundaries
5. **Loading states**: loading.tsx + Suspense fallbacks
6. **Server Actions**: for mutations
7. **Route Handlers**: for APIs

Consulte `resources/component-patterns.md` para Server/Client patterns e `resources/data-fetching.md` para strategies.

## Safety

- **SEMPRE** usar Server Components por default
- **VALIDAR** input em Server Actions
- **REVALIDAR** cache apropriadamente
- **HANDLE** errors em boundaries
- **STREAMING** para better UX
- **SECURITY**: Never expose secrets em Client Components

## 📚 Quick Reference 

### Server Component (Default)

```typescript
// app/dashboard/page.tsx
async function DashboardPage() {
  const data = await fetchData() // ✅ Can async/await directly

  return <div>{data.title}</div>
}
```

### Client Component

```typescript
// components/Counter.tsx
'use client' // ← Required

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0) // ✅ Can use hooks

  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

### Server Action

```typescript
// app/actions.ts
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title')
  await db.insert(posts).values({ title })
  revalidatePath('/posts')
}
```

## 🎨 Component Patterns

###Pattern 1: Server Component Composition

**Best**: Keep as much Server-side as possible.

```typescript
// app/page.tsx (Server Component)
import { ClientButton } from './ClientButton'

async function Page() {
  const data = await fetchData()

  return (
    <div>
      <h1>{data.title}</h1> {/* Server-rendered */}
      <ClientButton /> {/* Interactive island */}
    </div>
  )
}
```

### Pattern 2: Props from Server → Client

**Pass data from Server Component to Client Component via props**.

```typescript
// app/page.tsx (Server)
async function Page() {
  const user = await getUser()

  return <ClientComponent user={user} /> {/* ✅ Pass as prop */}
}

// components/ClientComponent.tsx
'use client'

export function ClientComponent({ user }: { user: User }) {
  const [count, setCount] = useState(0)

  return (
    <div>
      Hello {user.name}! Count: {count}
    </div>
  )
}
```

### Pattern 3: Client Component wrapping Server

**Use slot pattern for Server inside Client**.

```typescript
// components/Tabs.tsx (Client)
'use client'

export function Tabs({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState(0)

  return (
    <div>
      <button onClick={() => setTab(0)}>Tab 1</button>
      <button onClick={() => setTab(1)}>Tab 2</button>
      <div>{children}</div> {/* ✅ Can be Server Component */}
    </div>
  )
}

// app/page.tsx (Server)
async function Page() {
  const data = await fetchData()

  return (
    <Tabs>
      <div>{data.content}</div> {/* Server-rendered */}
    </Tabs>
  )
}
```

## 📡 Data Fetching

### Pattern 1: Direct Async

**Simplest**: Fetch directly in Server Component.

```typescript
async function PostsPage() {
  const posts = await db.select().from(posts)

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
```

### Pattern 2: Parallel Fetching

**Faster**: Fetch múltiplas requests em paralelo.

```typescript
async function DashboardPage() {
  // Start both requests in parallel
  const userPromise = getUser()
  const postsPromise = getPosts()

  // Wait for both
  const [user, posts] = await Promise.all([userPromise, postsPromise])

  return (
    <div>
      <UserProfile user={user} />
      <PostsList posts={posts} />
    </div>
  )
}
```

### Pattern 3: Streaming with Suspense

**Best UX**: Stream parts progressively.

```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <div>
      <UserInfo /> {/* Fast - shows immediately */}

      <Suspense fallback={<SkeletonPosts />}>
        <Posts /> {/* Slow - streams when ready */}
      </Suspense>

      <Suspense fallback={<SkeletonComments />}>
        <Comments /> {/* Slower - streams after */}
      </Suspense>
    </div>
  )
}

// Each component fetches independently
async function Posts() {
  const posts = await getPosts() // Slow query
  return <PostsList posts={posts} />
}
```

## 🚀 Server Actions

### Pattern 1: Form Submission

```typescript
// features/posts/actions/create-post.ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/core/auth'
import { headers } from 'next/headers'
import { z } from 'zod'

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
})

export async function createPost(formData: FormData) {
  // 1. Autenticar
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error('Unauthorized')
  }

  // 2. Validar input
  const parsed = createPostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })

  if (!parsed.success) {
    throw new Error('Invalid input')
  }

  // 3. Insert com userId do session (nunca do client)
  await db.insert(posts).values({
    title: parsed.data.title,
    content: parsed.data.content,
    userId: session.user.id,
  })

  // 4. Revalidate
  revalidatePath('/posts')
}

// app/new-post/page.tsx
import { createPost } from '@/features/posts/actions/create-post'

export default function NewPostPage() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

### Pattern 2: Programmatic Call

```typescript
// features/posts/actions/like-post.ts
'use server'

import { auth } from '@/core/auth'
import { headers } from 'next/headers'
import { z } from 'zod'

const likeSchema = z.object({
  postId: z.number().int().positive(),
})

export async function likePost(postId: number) {
  // 1. Autenticar
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error('Unauthorized')
  }

  // 2. Validar input
  const parsed = likeSchema.safeParse({ postId })
  if (!parsed.success) {
    throw new Error('Invalid input')
  }

  // 3. Verificar se post existe
  const post = await db
    .select()
    .from(posts)
    .where(eq(posts.id, parsed.data.postId))
    .limit(1)

  if (!post[0]) {
    throw new Error('Post not found')
  }

  await db
    .update(posts)
    .set({ likes: sql`${posts.likes} + 1` })
    .where(eq(posts.id, parsed.data.postId))

  revalidateTag(`post-${parsed.data.postId}`)

  return { success: true }
}

// components/LikeButton.tsx
'use client'

import { likePost } from '@/features/posts/actions/like-post'
import { useTransition } from 'react'

export function LikeButton({ postId }: { postId: number }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => likePost(postId))}
      disabled={isPending}
    >
      {isPending ? 'Liking...' : 'Like'}
    </button>
  )
}
```

## 🛣️ Route Handlers

### Pattern 1: API Route

```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/core/auth'
import { z } from 'zod'

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
})

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ✅ Filtrar por userId — nunca retornar dados de outros usuários
  const userPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.userId, session.user.id))

  return NextResponse.json({ posts: userPosts })
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ✅ Validar input com Zod
  const body = await req.json()
  const parsed = createPostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  // ✅ Usar userId do session, nunca do body
  const [post] = await db
    .insert(posts)
    .values({
      title: parsed.data.title,
      content: parsed.data.content,
      userId: session.user.id,
    })
    .returning()

  return NextResponse.json({ post }, { status: 201 })
}
```

### Pattern 2: Dynamic Route

```typescript
// app/api/posts/[id]/route.ts
import { auth } from '@/core/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Autenticar
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Validar param
  const postId = parseInt(params.id)
  if (isNaN(postId) || postId <= 0) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  // 3. Buscar com ownership check
  const post = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.userId, session.user.id)
      )
    )
    .limit(1)

  if (!post[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ post: post[0] })
}
```

## ⚡ Caching

### Pattern 1: Fetch with Cache

```typescript
// Cached for 1 hour
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 },
})

// Never cache (always fresh)
const data = await fetch('https://api.example.com/data', {
  cache: 'no-store',
})

// Cache forever (until manually revalidated)
const data = await fetch('https://api.example.com/data', {
  next: { tags: ['posts'] },
})
```

### Pattern 2: Unstable_cache

```typescript
import { unstable_cache } from 'next/cache'

const getCachedPosts = unstable_cache(
  async () => {
    return db.select().from(posts)
  },
  ['posts'], // Cache key
  { revalidate: 3600, tags: ['posts'] }
)
```

### Pattern 3: Revalidation

```typescript
import { revalidatePath, revalidateTag } from 'next/cache'

// Revalidate specific path
revalidatePath('/posts')

// Revalidate by tag
revalidateTag('posts')
```

## 📖 Resources

- [Component Patterns](./resources/component-patterns.md) - Server vs Client patterns
- [Data Fetching](./resources/data-fetching.md) - Fetching strategies

## 🔗 Links Úteis

- [Next.js Docs](https://nextjs.org/docs)
- [React Server Components](https://react.dev/blog/2023/03/22/react-labs-what-we-have-been-working-on-march-2023#react-server-components)
- [App Router Migration](https://nextjs.org/docs/app/building-your-application/upgrading)
