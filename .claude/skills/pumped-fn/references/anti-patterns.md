## Anti-Pattern Detection & Corrections

**Purpose:** Automated validation to catch violations before code delivery. Zero violations guarantee.

**Process:** Run validation checks, detect patterns, block delivery until all pass.

---

### Anti-Pattern 1: Multiple Scopes in Request Handlers

**Violation:**
```typescript
app.post('/users', async (req, res) => {
  const scope = createScope()
  const result = await scope.exec(createUser, req.body)
  await scope.dispose()
  res.json(result)
})
```

**Detection:**
```bash
grep -r "createScope()" src/routes/ src/api/ src/handlers/
```

**Correction:**
```typescript
const scope = createScope()
app.set('scope', scope)

app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  const result = await scope.exec(createUser, req.body)
  res.json(result)
})
```

**Why:** Creating scope per request wastes resources, breaks connection pooling, causes memory leaks.

---

### Anti-Pattern 2: Built-ins in Executors

**Violation:**
```typescript
const dbPool = provide(() => createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432')
}))
```

**Detection:**
```bash
grep -r "process.env" src/resource-* src/flow-* src/repo-*
grep -r "import.meta.env" src/resource-* src/flow-* src/repo-*
```

**Correction:**
```typescript
import { tag, custom } from '@pumped-fn/core-next'

const dbConfig = tag(custom<{
  host: string
  port: number
}>(), { label: 'config.database' })

const dbPool = provide((controller) => {
  const config = dbConfig.get(controller.scope)
  return createPool({
    host: config.host,
    port: config.port
  })
})

const scope = createScope({
  tags: [
    dbConfig({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432')
    })
  ]
})
```

**Why:** Built-ins in executors prevent testing, break testability, couple code to environment.

---

### Anti-Pattern 3: Premature Scope Escape

**Violation:**
```typescript
const scope = createScope()
const db = await scope.resolve(dbPool)
const userRepo = await scope.resolve(userRepository)

app.post('/users', async (req, res) => {
  const user = await userRepo.create(req.body)
  res.json(user)
})
```

**Detection:**
```bash
grep -r "scope.resolve(" src/main.ts src/index.ts src/app.ts
```

**Correction:**
```typescript
const scope = createScope()
app.set('scope', scope)

app.post('/users', async (req, res) => {
  const scope = req.app.get('scope')
  const result = await scope.exec(createUser, {
    email: req.body.email,
    name: req.body.name
  })
  res.json(result)
})
```

**Why:** Premature resolution breaks observability, loses journaling, makes flows untraceable.

---

### Anti-Pattern 4: Missing Journaling

**Violation:**
```typescript
const createUser = flow(
  { db: dbPool },
  ({ db }) => async (ctx, input) => {
    const id = randomUUID()
    const user = await db.query('INSERT INTO users ...', [id, input.email])
    return { success: true, user }
  }
)
```

**Detection:**
```bash
grep -l "flow(" src/flow-*.ts | xargs grep -L "ctx.run\|ctx.exec"
```

**Correction:**
```typescript
const createUser = flow(
  { db: dbPool },
  ({ db }) => async (ctx, input) => {
    const id = await ctx.run('generate-id', () => randomUUID())
    const user = await ctx.run('insert-user', () =>
      db.query('INSERT INTO users ...', [id, input.email])
    )
    return { success: true, user }
  }
)
```

**Why:** Missing journaling breaks observability, loses operation tracking, makes debugging impossible.

---

### Anti-Pattern 5: Type Safety Violations

**Violation:**
```typescript
const userRepo = derive(dbPool, (db: any) => ({
  findById: async (id: string) => {
    const result = await db.query('...')
    return result as User
  }
}))
```

**Detection:**
```bash
grep -r ": any\|: unknown\| as " src/**/*.ts --include="*.ts" --exclude="*.test.ts"
```

**Correction:**
```typescript
type DbPool = {
  query: <T>(sql: string, params: any[]) => Promise<T[]>
}

const userRepo = derive(dbPool, (db: DbPool) => ({
  findById: async (id: string): Promise<User | null> => {
    const rows = await db.query<User>('SELECT * FROM users WHERE id = $1', [id])
    return rows[0] || null
  }
}))
```

**Why:** Type violations break compile-time safety, hide bugs, cause runtime errors.

---

### Anti-Pattern 6: Excessive Mocking

**Violation:**
```typescript
import { vi } from 'vitest'

vi.mock('uuid', () => ({ randomUUID: () => 'test-id' }))
vi.mock('../database', () => ({ query: vi.fn() }))

test('createUser', async () => {
  const result = await createUser(...)
})
```

**Detection:**
```bash
grep -r "vi.mock\|jest.mock" src/**/*.test.ts | wc -l
```

**Correction:**
```typescript
import { preset, createScope } from '@pumped-fn/core-next'

test('createUser', async () => {
  const mockDb = { query: vi.fn(() => Promise.resolve([...])) }

  const scope = createScope({
    presets: [preset(dbPool, mockDb)]
  })

  const result = await scope.exec(createUser, { email: 'test@example.com', name: 'Test' })

  expect(mockDb.query).toHaveBeenCalled()
  await scope.dispose()
})
```

**Why:** Global mocks break isolation, couple tests, make tests brittle.

---

