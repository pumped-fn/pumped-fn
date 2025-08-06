# TypeScript Service Graph

**Runtime service errors → Compile-time safety. Three primitives. Full type inference.**

## From Runtime Chaos to Compile-Time Peace

Service dependencies fail at runtime, changes break unexpectedly:

```typescript
// Fragile: breaks at runtime, no type flow
class UserService {
  constructor(private db: Database, private auth: AuthService) {}
  async getUser(id: string) {
    return this.db.findUser(id); // Runtime error if db undefined
  }
}

// Manual wiring - easy to break, hard to change
const db = new Database(config.url);
const auth = new AuthService(config.secret);
const users = new UserService(db, auth); // Wrong order = runtime crash
```

Service graph with **compile-time safety**:

```typescript
// Type-safe: breaks at compile-time, full inference
const config = provide(() => ({ url: 'db://...', secret: 'jwt-key' }));
const database = derive(config, cfg => new Database(cfg.url));
const authService = derive(config, cfg => new AuthService(cfg.secret));
const userService = derive([database, authService], ([db, auth]) => new UserService(db, auth));
//                        ^^^^^^^^^^^^^^^^^^^^ TypeScript enforces correct dependencies

const scope = createScope();
const users = await scope.resolve(userService); // Type: UserService, guaranteed valid
```

**Result**: Dependency errors caught at compile-time, full type inference, breaking changes visible in IDE.

## Full Type Inference Example

```typescript
// TypeScript infers complete service graph types
const apiKey = provide(() => process.env.API_KEY!);
const httpClient = derive(apiKey, key => new HttpClient({ apiKey: key }));
const userRepo = derive(httpClient, client => new UserRepository(client));
const cacheService = derive(userRepo, repo => new CacheService(repo));

// Full type inference through the chain
const scope = createScope();
const cache = await scope.resolve(cacheService);
//    ^^^^^ Type: CacheService - TypeScript knows exact type through all dependencies
```

**Compile-time guarantees:**
- Missing dependencies fail TypeScript compilation
- Type mismatches caught in IDE
- Refactoring shows all affected services
- Breaking interface changes visible immediately

## Three Type-Safe Primitives

**`provide<T>(factory: () => T)`** - Type-safe containers
```typescript
const config = provide(() => ({ dbUrl: 'sqlite://app.db' }));
//    ^^^^^^ Type: Executor<{ dbUrl: string }>
```

**`derive<T>(deps, factory: (...deps) => T)`** - Type-safe composition
```typescript
const userService = derive([database, logger], ([db, log]) => new UserService(db, log));
//    ^^^^^^^^^^^ Type: Executor<UserService> - TypeScript enforces parameter types
```

**`createScope().resolve<T>(executor: Executor<T>)`** - Type-safe resolution
```typescript
const users = await scope.resolve(userService);
//    ^^^^^ Type: UserService - exact type guaranteed
```

## Complex Service Graph with Full Inference

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next';

// Configuration with exact types
const dbConfig = provide(() => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: process.env.NODE_ENV === 'production'
} as const));

const jwtConfig = provide(() => ({
  secret: process.env.JWT_SECRET!,
  expiresIn: '24h'
} as const));

// Database with type inference from config
const database = derive(dbConfig, cfg => new Database(cfg));
//    ^^^^^^^^ Type: Executor<Database>

// Repository with database dependency
const userRepository = derive(database, db => ({
  async findById(id: string): Promise<User | null> {
    return db.query('SELECT * FROM users WHERE id = $1', [id]);
  },
  async create(userData: CreateUserData): Promise<User> {
    return db.query('INSERT INTO users ...', [userData]);
  }
}));
//    ^^^^^^^^^^^^^^ Type: Executor<{ findById: ..., create: ... }>

// JWT service with config dependency  
const tokenService = derive(jwtConfig, cfg => ({
  sign: (payload: object) => jwt.sign(payload, cfg.secret, { expiresIn: cfg.expiresIn }),
  verify: (token: string) => jwt.verify(token, cfg.secret)
}));

// Authentication service combining multiple dependencies
const authService = derive([userRepository, tokenService], ([users, tokens]) => ({
  async authenticate(email: string, password: string) {
    const user = await users.findById(email);
    //          ^^^^^^^^^^^^^^^^^^^^^^^^^ Type: Promise<User | null>
    if (!user) throw new Error('User not found');
    
    const token = tokens.sign({ userId: user.id });
    //    ^^^^^ Type: string
    return { user, token };
  }
}));
//    ^^^^^^^^^^^ Type: Executor<{ authenticate: (email: string, password: string) => Promise<{ user: User, token: string }> }>

// Usage with complete type safety
const scope = createScope();
const auth = await scope.resolve(authService);
//    ^^^^ Type: { authenticate: (email: string, password: string) => Promise<{ user: User, token: string }> }

const result = await auth.authenticate('user@example.com', 'password');
//    ^^^^^^ Type: { user: User, token: string }
```

**Compile-time benefits demonstrated:**
- Config type changes propagate through entire graph
- Interface changes show affected services immediately  
- Missing environment variables caught by TypeScript
- Full autocomplete and error checking in IDE
- Refactoring safety across service boundaries

## Installation & Type Setup

```bash
npm install @pumped-fn/core-next
```

**TypeScript configuration:**
```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Why Choose TypeScript Service Graph?

::: tip Compile-Time Safety
🛡️ Catch dependency errors at build time, not in production. Breaking changes visible immediately in your IDE.
:::

::: tip Full Type Inference
🔮 Zero manual type annotations. TypeScript automatically infers types through your entire service graph.
:::

::: tip Refactoring Confidence
🔧 Change interfaces safely. Your IDE shows every affected service across your entire codebase.
:::

::: tip Type-Safe Testing
✅ Mock services with exact interface validation. No more runtime surprises from incomplete mocks.
:::

::: tip Small Bundle Size
📦 Enterprise features in ~3KB. Excellent tree-shaking eliminates unused code automatically.
:::

::: tip Zero Learning Curve
⚡ Just 3 primitives: provide(), derive(), resolve(). Most developers productive in 30 minutes.
:::

## Quick Decision Guide

**Choose Pumped Functions if you:**
- Want compile-time safety for service dependencies
- Need full TypeScript inference without manual typing  
- Value refactoring confidence and IDE integration
- Prefer catching errors at build time, not runtime

**Continue with Redux/Zustand if you:**
- Have complex state management requirements
- Need time-travel debugging capabilities
- Prefer established ecosystems with extensive plugins
- Are satisfied with runtime error discovery

## Next Steps

::: info 🚀 Start Building
Get compile-time service safety in 5 minutes with our step-by-step tutorial.

[Quick Start Guide →](./getting-started/quickstart)
:::

::: info 📖 See Advanced Examples
Complex service graphs, React integration, and enterprise patterns with full type safety.

[Advanced Examples →](./show-me-code)
:::

**Evaluating alternatives?** [Common questions answered](./faq)