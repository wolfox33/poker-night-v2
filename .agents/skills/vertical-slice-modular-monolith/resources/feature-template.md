# Feature Template

Template completo para criar novas features seguindo Vertical Slice Architecture.

## Estrutura

```
features/{feature-name}/
 ├─ api/
 │   └─ {action}.ts
 ├─ service/
 │   └─ {action}.ts
 ├─ repo/
 │   └─ {feature}-repo.ts
 ├─ components/         # Se houver UI
 │   └─ {Component}.tsx
 ├─ types.ts
 ├─ validators.ts
 └─ README.md
```

## Exemplo Completo: Feature "Tasks"

### 1. Types

```typescript
// features/tasks/types.ts
export interface Task {
  id: string
  userId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: Date | null
  createdAt: Date
  updatedAt: Date
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export interface CreateTaskRequest {
  title: string
  description?: string
  priority?: TaskPriority
  dueDate?: Date
}

export interface UpdateTaskRequest {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: Date
}
```

### 2. Validators

```typescript
// features/tasks/validators.ts
import { z } from 'zod'
import { TaskStatus, TaskPriority } from './types'

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  dueDate: z.coerce.date().optional(),
})

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: z.coerce.date().optional(),
})

export const taskIdSchema = z.string().uuid()
```

### 3. Repository

```typescript
// features/tasks/repo/tasks-repo.ts
import { db } from '@/core/db'
import type { Task, CreateTaskRequest, UpdateTaskRequest } from '../types'
import { TaskStatus } from '../types'

export const tasksRepo = {
  async create(userId: string, data: CreateTaskRequest): Promise<Task> {
    return await db.task.create({
      data: {
        userId,
        title: data.title,
        description: data.description || null,
        priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate || null,
        status: TaskStatus.TODO,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
  },

  async findById(id: string): Promise<Task | null> {
    return await db.task.findUnique({
      where: { id },
    })
  },

  async findByUserId(userId: string, filters?: {
    status?: TaskStatus
    limit?: number
  }): Promise<Task[]> {
    return await db.task.findMany({
      where: {
        userId,
        ...(filters?.status && { status: filters.status }),
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
      take: filters?.limit || 100,
    })
  },

  async update(id: string, data: UpdateTaskRequest): Promise<Task> {
    return await db.task.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    })
  },

  async delete(id: string): Promise<boolean> {
    await db.task.delete({
      where: { id },
    })
    return true
  },
}
```

### 4. Services

```typescript
// features/tasks/service/create-task.ts
import { tasksRepo } from '../repo/tasks-repo'
import type { CreateTaskRequest, Task } from '../types'
import { logger } from '@/core/logger'

export async function createTask(
  userId: string,
  request: CreateTaskRequest
): Promise<Task> {
  logger.info({ userId, title: request.title }, 'Creating task')

  const task = await tasksRepo.create(userId, request)

  logger.info({ userId, taskId: task.id }, 'Task created successfully')

  return task
}
```

```typescript
// features/tasks/service/update-task.ts
import { tasksRepo } from '../repo/tasks-repo'
import type { UpdateTaskRequest, Task } from '../types'
import { logger } from '@/core/logger'

export async function updateTask(
  userId: string,
  taskId: string,
  request: UpdateTaskRequest
): Promise<Task> {
  // Verificar ownership
  const task = await tasksRepo.findById(taskId)
  
  if (!task) {
    throw new Error('Task not found')
  }
  
  if (task.userId !== userId) {
    throw new Error('Unauthorized')
  }

  logger.info({ userId, taskId }, 'Updating task')

  const updated = await tasksRepo.update(taskId, request)

  logger.info({ userId, taskId }, 'Task updated successfully')

  return updated
}
```

```typescript
// features/tasks/service/get-tasks.ts
import { tasksRepo } from '../repo/tasks-repo'
import type { Task, TaskStatus } from '../types'

export async function getTasks(
  userId: string,
  filters?: { status?: TaskStatus }
): Promise<Task[]> {
  return await tasksRepo.findByUserId(userId, filters)
}
```

### 5. API Endpoints

```typescript
// features/tasks/api/create.ts
import { NextRequest, NextResponse } from 'next/server'
import { createTask } from '../service/create-task'
import { createTaskSchema } from '../validators'
import { requireAuth } from '@/core/auth'

export const POST = requireAuth(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const validated = createTaskSchema.parse(body)
    
    const userId = req.user.id
    const task = await createTask(userId, validated)
    
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

```typescript
// features/tasks/api/list.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTasks } from '../service/get-tasks'
import { requireAuth } from '@/core/auth'
import { TaskStatus } from '../types'

export const GET = requireAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') as TaskStatus | undefined
    
    const userId = req.user.id
    const tasks = await getTasks(userId, { status })
    
    return NextResponse.json(tasks)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

```typescript
// features/tasks/api/[id]/update.ts
import { NextRequest, NextResponse } from 'next/server'
import { updateTask } from '../../service/update-task'
import { updateTaskSchema, taskIdSchema } from '../../validators'
import { requireAuth } from '@/core/auth'

export const PATCH = requireAuth(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  try {
    const taskId = taskIdSchema.parse(params.id)
    const body = await req.json()
    const validated = updateTaskSchema.parse(body)
    
    const userId = req.user.id
    const task = await updateTask(userId, taskId, validated)
    
    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === 'Unauthorized' ? 403 : 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
```

### 6. Components (UI)

```tsx
// features/tasks/components/TaskList.tsx
'use client'

import { Task } from '../types'

interface TaskListProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No tasks found
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          onClick={() => onTaskClick(task)}
        />
      ))}
    </div>
  )
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{task.title}</h3>
        <span className={`px-2 py-1 rounded text-sm ${
          task.priority === 'HIGH' ? 'bg-red-100 text-red-800' :
          task.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {task.priority}
        </span>
      </div>
      {task.description && (
        <p className="text-sm text-gray-600 mt-1">{task.description}</p>
      )}
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span>Status: {task.status}</span>
        {task.dueDate && (
          <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  )
}
```

### 7. Tests

```typescript
// features/tasks/service/create-task.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTask } from './create-task'
import { tasksRepo } from '../repo/tasks-repo'
import { TaskPriority, TaskStatus } from '../types'

vi.mock('../repo/tasks-repo')

describe('createTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create task with default values', async () => {
    const mockTask = {
      id: 'task-123',
      userId: 'user-123',
      title: 'Test Task',
      description: null,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dueDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.mocked(tasksRepo.create).mockResolvedValue(mockTask)

    const result = await createTask('user-123', {
      title: 'Test Task',
    })

    expect(result).toEqual(mockTask)
    expect(tasksRepo.create).toHaveBeenCalledWith('user-123', {
      title: 'Test Task',
    })
  })

  it('should create task with custom priority', async () => {
    const mockTask = {
      id: 'task-123',
      userId: 'user-123',
      title: 'Urgent Task',
      description: null,
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      dueDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.mocked(tasksRepo.create).mockResolvedValue(mockTask)

    const result = await createTask('user-123', {
      title: 'Urgent Task',
      priority: TaskPriority.HIGH,
    })

    expect(result.priority).toBe(TaskPriority.HIGH)
  })
})
```

### 8. README

```markdown
# Tasks Feature

Gerenciamento de tarefas (TODO list) com prioridades e status.

## Endpoints

- `POST /api/tasks` - Criar nova task
- `GET /api/tasks` - Listar tasks do usuário
- `GET /api/tasks?status=TODO` - Filtrar por status
- `PATCH /api/tasks/:id` - Atualizar task
- `DELETE /api/tasks/:id` - Deletar task

## Services Públicos

```typescript
import { createTask } from '@/features/tasks/service/create-task'
import { getTasks } from '@/features/tasks/service/get-tasks'
import { updateTask } from '@/features/tasks/service/update-task'
```

## Dependências

- `@/core/db` - Database connection
- `@/core/auth` - Authentication
- `@/core/logger` - Logging

## Database Schema

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'TODO',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  due_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
```
```

## Checklist para Nova Feature

- [ ] Criar diretório `features/{nome}/`
- [ ] Definir types em `types.ts`
- [ ] Criar validators com Zod em `validators.ts`
- [ ] Implementar repository em `repo/{nome}-repo.ts`
- [ ] Criar services em `service/`
- [ ] Implementar API endpoints em `api/`
- [ ] Adicionar components (se UI) em `components/`
- [ ] Escrever testes unitários
- [ ] Escrever testes de integração
- [ ] Documentar em README.md
- [ ] Adicionar migrations de banco
- [ ] Atualizar rotas da aplicação
