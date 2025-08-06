# Type-Safe Testing Patterns

**Compile-time service safety in 5 minutes.**

## Before: Runtime Service Chaos

```typescript
// Fragile: fails at runtime, no type safety
class App {
  constructor() {
    this.config = loadConfig();
    this.database = new Database(this.config.dbUrl); // Runtime error if config undefined
    this.userRepo = new UserRepository(this.database);
    this.emailService = new EmailService(this.config.emailKey);
    this.authService = new AuthService(this.userRepo, this.emailService, this.config.jwtSecret);
  }
}

// Testing: 15+ lines of type-unsafe mocking with any casts
const mockDatabase: any = { query: jest.fn() };
const mockUserRepo: any = { findById: jest.fn() };
// Type errors hidden until runtime
```

## After: Compile-Time Type Safety

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next';

// Type-safe service graph - TypeScript enforces dependencies
const config = provide(() => loadConfig()); // Type: Executor<Config>
const database = derive(config, cfg => new Database(cfg.dbUrl)); // Type: Executor<Database>
const userRepo = derive(database, db => new UserRepository(db)); // Type: Executor<UserRepository>
const emailService = derive(config, cfg => new EmailService(cfg.emailKey)); // Type: Executor<EmailService>
const authService = derive([userRepo, emailService, config], ([users, email, cfg]) => 
  new AuthService(users, email, cfg.jwtSecret) // TypeScript validates all parameter types
);

// Type-safe resolution
const scope = createScope();
const auth = await scope.resolve(authService); // Type: AuthService, guaranteed valid

// Type-safe testing - full autocomplete and error checking
const testScope = createScope();
testScope.preset(userRepo, {
  findById: vi.fn().mockResolvedValue({ id: 1, email: 'test@example.com' }),
  create: vi.fn().mockResolvedValue({ id: 2 })
} satisfies UserRepository); // TypeScript validates mock interface
const testAuth = await testScope.resolve(authService); // Type: AuthService
```

## Type-Safe Service Composition

**Type inference flows through entire dependency graph:**

```typescript
// TypeScript validates dependencies at compile-time
const config = provide(() => ({ 
  dbUrl: process.env.DB_URL!, 
  jwtSecret: process.env.JWT_SECRET! 
}));
//    ^^^^^^ Type: Executor<{ dbUrl: string, jwtSecret: string }>

const database = derive(config, cfg => new Database(cfg.dbUrl));
//    ^^^^^^^^ Type: Executor<Database> - inferred from config type

const userRepo = derive(database, db => new UserRepository(db));
//    ^^^^^^^^ Type: Executor<UserRepository> - inferred from database type

const authService = derive([userRepo, config], ([users, cfg]) => ({
  async login(email: string, password: string): Promise<string> {
    const user = await users.findByEmail(email);
    //          ^^^^^^^^^^^^^^^^^^^^^^^^^ Type: Promise<User | null> - full inference
    if (!user) throw new Error('Invalid credentials');
    return jwt.sign({ userId: user.id }, cfg.jwtSecret);
  }
}));
//    ^^^^^^^^^^^ Type: Executor<{ login: (email: string, password: string) => Promise<string> }>
```

## Full Type-Safe Testing

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('AuthService', () => {
  it('authenticates users with full type safety', async () => {
    const testScope = createScope();
    
    // TypeScript validates mock matches exact interface
    testScope.preset(userRepo, {
      findByEmail: vi.fn().mockResolvedValue({ 
        id: 1, 
        email: 'test@example.com',
        password: 'hashed'
      }),
      create: vi.fn()
    } satisfies UserRepository); // Compile-time interface validation
    
    const auth = await testScope.resolve(authService);
    //    ^^^^ Type: { login: (email: string, password: string) => Promise<string> }
    
    const token = await auth.login('test@example.com', 'password');
    //    ^^^^^ Type: string - TypeScript knows exact return type
    
    expect(typeof token).toBe('string');
  });
});
```

**Compile-time safety demonstrated:**
- Mock interface must match exactly - TypeScript validates at build time
- Parameter types enforced - wrong types fail compilation
- Return types guaranteed - no runtime type surprises
- Missing methods caught immediately in IDE

## Advanced Type Composition

```typescript
// Complex service graph with full type inference
const emailService = derive(config, cfg => new EmailService(cfg.emailKey));
const notificationService = derive([userRepo, emailService], ([users, email]) => ({
  async notifyUser(userId: string, message: string) {
    const user = await users.findById(userId);
    //          ^^^^^^^^^^^^^^^^^^^^^^^^^ Type: Promise<User | null>
    if (user) await email.send(user.email, message);
  }
}));

// Multi-service composition - all types flow through
const appService = derive([authService, notificationService], ([auth, notify]) => ({
  async registerAndNotify(email: string, password: string) {
    const token = await auth.login(email, password);
    //    ^^^^^ Type: string - inferred from authService
    await notify.notifyUser(userId, 'Welcome!');
    return token;
  }
}));
//    ^^^^^^^^^^ Type: Executor<{ registerAndNotify: ... }> - complete type inference
```

**Benefits:**
- Breaking interface changes caught at compile-time
- Refactoring shows all affected services in IDE
- Full autocomplete throughout service graph
- Zero runtime type errors from dependency issues

## You're Ready for Type-Safe Services

**In 5 minutes you learned:**
- How to get compile-time safety for service dependencies
- How to leverage full TypeScript inference through service graphs
- How to test with complete type safety
- How to catch breaking changes at build time

## React Integration Example

**Connect your type-safe services to React components:**

```typescript
import { ScopeProvider, useResolves } from '@pumped-fn/react';

// Same service graph from above
const authService = derive([userRepo, config], ([users, cfg]) => ({
  async login(email: string, password: string): Promise<string> {
    const user = await users.findByEmail(email);
    if (!user) throw new Error('Invalid credentials');
    return jwt.sign({ userId: user.id }, cfg.jwtSecret);
  }
}));

function LoginForm() {
  const [auth] = useResolves(authService);
  //    ^^^^ Type: { login: (email: string, password: string) => Promise<string> }
  
  const handleSubmit = async (email: string, password: string) => {
    const token = await auth.login(email, password);
    //    ^^^^^ Type: string - TypeScript knows exact return type
    localStorage.setItem('token', token);
  };

  return <form onSubmit={...}>/* Your form UI */</form>;
}

// Provide scope to your app
const scope = createScope();

export default function App() {
  return (
    <ScopeProvider scope={scope}>
      <LoginForm />
    </ScopeProvider>
  );
}
```

## What You've Learned

**In 5 minutes you mastered:**
- ✅ **Compile-time dependency safety** - no more runtime service errors
- ✅ **Full TypeScript inference** - exact types through entire service graph  
- ✅ **Type-safe testing** - mocks validated against exact interfaces
- ✅ **React integration** - type-safe hooks with automatic resolution

**Key benefits achieved:**
- 🛡️ **Zero runtime dependency errors** - all caught at compile-time
- 🔮 **Perfect IDE support** - full autocomplete and refactoring safety
- ⚡ **Faster development** - catch breaking changes immediately
- 🧪 **Reliable testing** - interface changes update all tests automatically

## Next Steps

::: info 🏗️ Advanced Patterns
Complex service graphs, API clients, caching, and enterprise architecture patterns.

[See Advanced Examples →](../show-me-code)
:::

::: info 🤔 Have Questions?
Common migration concerns, bundle size, performance, and integration questions answered.

[Read FAQ →](../faq)
:::

**Start building with confidence:** You now have compile-time guarantees for your entire service architecture.