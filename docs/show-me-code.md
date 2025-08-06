# Advanced Type Composition

**Copy-paste examples with full TypeScript inference through complex service graphs.**

## Type-Safe Microservice Architecture

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

// Strict configuration with compile-time validation
const config = provide(
  () =>
    ({
      port: parseInt(process.env.PORT!) || 3000,
      dbUrl: process.env.DB_URL!,
      jwtSecret: process.env.JWT_SECRET!,
    } as const)
);
//    ^^^^^^ Type: Executor<{ readonly port: number, readonly dbUrl: string, readonly jwtSecret: string }>

// Database with type inference from config
const database = derive(config, (cfg) => new Database(cfg.dbUrl));
//    ^^^^^^^^ Type: Executor<Database>

// Repository with exact method signatures
const userRepository = derive(
  database,
  (db) =>
    ({
      async findById(id: string): Promise<User | null> {
        return db.query("SELECT * FROM users WHERE id = $1", [id]);
      },
      async create(userData: CreateUserRequest): Promise<User> {
        return db.query(
          "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *",
          [userData.email, userData.name]
        );
      },
    } satisfies UserRepository)
);
//    ^^^^^^^^^^^^^^ Type: Executor<UserRepository> - interface validated at compile-time

// JWT service with config dependency
const tokenService = derive(config, (cfg) => ({
  sign: (payload: TokenPayload): string => jwt.sign(payload, cfg.jwtSecret),
  verify: (token: string): TokenPayload =>
    jwt.verify(token, cfg.jwtSecret) as TokenPayload,
}));

// Authentication service with multi-dependency type composition
const authService = derive(
  [userRepository, tokenService],
  ([users, tokens]) => ({
    async authenticate(email: string, password: string): Promise<AuthResult> {
      const user = await users.findById(email);
      //          ^^^^^^^^^^^^^^^^^^^^^^^^^ Type: Promise<User | null>
      if (!user) throw new AuthError("User not found");

      const token = tokens.sign({ userId: user.id, email: user.email });
      //    ^^^^^ Type: string - TypeScript infers from tokenService
      return { user, token, expiresIn: "24h" };
    },
  })
);
//    ^^^^^^^^^^^ Type: Executor<{ authenticate: (email: string, password: string) => Promise<AuthResult> }>

// Express server with full type inference
const server = derive([config, authService], ([cfg, auth]) => {
  const app = express();
  app.post("/auth/login", async (req, res) => {
    const result = await auth.authenticate(req.body.email, req.body.password);
    //    ^^^^^^ Type: AuthResult - exact type known at compile-time
    res.json(result);
  });
  return app.listen(cfg.port);
});

// Type-safe resolution
const scope = createScope();
const app = await scope.resolve(server);
//    ^^^ Type: Server - TypeScript knows exact type
```

**Compile-time guarantees:**

- Missing environment variables fail TypeScript build
- Interface changes propagate through entire service graph
- Dependency type mismatches caught in IDE
- Full autocomplete and refactoring safety

## Type-Safe API Client with Caching

**HTTP client with compile-time endpoint validation:**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

// Strict API configuration
const apiConfig = provide(
  () =>
    ({
      baseUrl: "https://api.example.com" as const,
      apiKey: process.env.API_KEY!,
      timeout: 5000,
      retries: 3,
    } as const)
);

// Type-safe HTTP client
interface ApiEndpoints {
  "/users": { method: "GET"; response: User[] };
  "/users/{id}": { method: "GET"; params: { id: string }; response: User };
  "/auth/login": { method: "POST"; body: LoginRequest; response: AuthResponse };
}

const httpClient = derive(apiConfig, (cfg) => ({
  async request<K extends keyof ApiEndpoints>(
    endpoint: K,
    options?: ApiEndpoints[K] extends { body: infer B }
      ? { body: B }
      : ApiEndpoints[K] extends { params: infer P }
      ? { params: P }
      : {}
  ): Promise<ApiEndpoints[K]["response"]> {
    // Type-safe API implementation
    const url = `${cfg.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      ...options,
    });
    return response.json();
  },
}));
//    ^^^^^^^^^^ Type: Executor<{ request: <K extends keyof ApiEndpoints>(...) => Promise<ApiEndpoints[K]['response']> }>

// Cache service with exact type preservation
const cacheService = derive(httpClient, (client) => ({
  cache: new Map<string, { data: any; expires: number }>(),

  async get<K extends keyof ApiEndpoints>(
    endpoint: K,
    options?: any,
    ttl = 60000
  ): Promise<ApiEndpoints[K]["response"]> {
    const cacheKey = `${endpoint}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() < cached.expires) {
      return cached.data as ApiEndpoints[K]["response"];
    }

    const data = await client.request(endpoint, options);
    //    ^^^^ Type: ApiEndpoints[K]['response'] - exact endpoint return type
    this.cache.set(cacheKey, { data, expires: Date.now() + ttl });
    return data;
  },
}));

// User service with compile-time endpoint validation
const userService = derive(cacheService, (cache) => ({
  async getUsers(): Promise<User[]> {
    return cache.get("/users"); // TypeScript validates endpoint exists
    //     ^^^^^^^^^^^^^^^^^^^^ Type: Promise<User[]>
  },

  async getUser(id: string): Promise<User> {
    return cache.get("/users/{id}", { params: { id } });
    //     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Type: Promise<User>
  },

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    return cache.get("/auth/login", { body: credentials });
    //     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Type: Promise<AuthResponse>
  },
}));

// Usage with full type safety
const scope = createScope();
const users = await scope.resolve(userService);

const userList = await users.getUsers();
//    ^^^^^^^^ Type: User[] - TypeScript knows exact return type

const singleUser = await users.getUser("123");
//    ^^^^^^^^^^ Type: User - exact type guaranteed

// Type error if wrong endpoint used:
// await users.cache.get('/invalid-endpoint'); // ❌ TypeScript error: not in ApiEndpoints
```

**Compile-time API safety:**

- Endpoint URLs validated against interface at build time
- Request/response types enforced for each endpoint
- Parameter and body types checked automatically
- Refactoring API changes shows all usage locations

## Type-Safe React Integration

**Full type inference through React component tree:**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";
import { ScopeProvider, useResolves, useUpdate } from "@pumped-fn/react";

// Typed form state with validation
interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
}

const formData = provide<FormData>(() => ({
  email: "",
  password: "",
  confirmPassword: "",
}));

// Type-safe validation with exact error types
type ValidationResult<T> =
  | { isValid: true; value: T }
  | { isValid: false; error: string };

const emailValidation = derive(
  formData.reactive,
  (data): ValidationResult<string> => {
    if (!data.email) return { isValid: false, error: "Email required" };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return { isValid: false, error: "Invalid email format" };
    }
    return { isValid: true, value: data.email };
  }
);

const passwordValidation = derive(
  formData.reactive,
  (data): ValidationResult<string> => {
    if (!data.password) return { isValid: false, error: "Password required" };
    if (data.password.length < 8)
      return { isValid: false, error: "Min 8 characters" };
    if (!/[A-Z]/.test(data.password))
      return { isValid: false, error: "Needs uppercase" };
    return { isValid: true, value: data.password };
  }
);

const confirmValidation = derive(
  formData.reactive,
  (data): ValidationResult<string> => {
    if (!data.confirmPassword)
      return { isValid: false, error: "Confirmation required" };
    if (data.password !== data.confirmPassword) {
      return { isValid: false, error: "Passwords must match" };
    }
    return { isValid: true, value: data.confirmPassword };
  }
);

// Form validity with exact typing
const formValidation = derive(
  [
    emailValidation.reactive,
    passwordValidation.reactive,
    confirmValidation.reactive,
  ],
  ([email, pwd, confirm]) => ({
    isValid: email.isValid && pwd.isValid && confirm.isValid,
    errors: {
      email: email.isValid ? null : email.error,
      password: pwd.isValid ? null : pwd.error,
      confirmPassword: confirm.isValid ? null : confirm.error,
    },
  })
);
//    ^^^^^^^^^^^^^^ Type: Executor<{ isValid: boolean; errors: { email: string | null; password: string | null; confirmPassword: string | null } }>

function RegistrationForm() {
  const [data, validation] = useResolves(formData, formValidation);
  //    ^^^^ Type: FormData
  //           ^^^^^^^^^^ Type: { isValid: boolean; errors: {...} }

  const updateForm = useUpdate(formData);

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    updateForm({ ...data, [field]: value });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (validation.isValid) {
          console.log("Form submitted:", data);
          //                              ^^^^ Type: FormData - exact type known
        }
      }}
    >
      <input
        type="email"
        value={data.email}
        onChange={(e) => updateField("email", e.target.value)}
        style={{ borderColor: validation.errors.email ? "red" : "green" }}
      />
      {validation.errors.email && (
        <p style={{ color: "red" }}>{validation.errors.email}</p>
      )}
      {/*                                                   ^^^^^^^^^^^^^^^^^^^^^^ Type: string | null */}

      <input
        type="password"
        value={data.password}
        onChange={(e) => updateField("password", e.target.value)}
        style={{ borderColor: validation.errors.password ? "red" : "green" }}
      />
      {validation.errors.password && (
        <p style={{ color: "red" }}>{validation.errors.password}</p>
      )}

      <button disabled={!validation.isValid}>Register</button>
      {/*                ^^^^^^^^^^^^^^^^^^^ Type: boolean */}
    </form>
  );
}

// Usage with type-safe scope
const scope = createScope();

export default function App() {
  return (
    <ScopeProvider scope={scope}>
      <RegistrationForm />
    </ScopeProvider>
  );
}
```

**React type safety benefits:**

- Form state and validation types flow through entire component tree
- Field updates are type-checked at compile-time
- Validation errors have exact string types
- Component props automatically inferred from service graph

## Installation & TypeScript Setup

```bash
npm install @pumped-fn/core-next @pumped-fn/react
```

**Recommended `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## Enterprise Deployment Example

**Production-ready service graph with health checks and monitoring:**

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

// Environment-aware configuration
const appConfig = provide(
  () =>
    ({
      env: process.env.NODE_ENV || "development",
      port: parseInt(process.env.PORT || "3000"),
      database: {
        url: process.env.DATABASE_URL!,
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10"),
        ssl: process.env.NODE_ENV === "production",
      },
      redis: {
        url: process.env.REDIS_URL!,
        ttl: parseInt(process.env.CACHE_TTL || "3600"),
      },
      monitoring: {
        enabled: process.env.NODE_ENV === "production",
        endpoint: process.env.MONITORING_ENDPOINT!,
      },
    } as const)
);

// Database with connection pooling
const database = derive(
  appConfig,
  (cfg) =>
    new DatabasePool({
      connectionString: cfg.database.url,
      max: cfg.database.maxConnections,
      ssl: cfg.database.ssl,
    })
);

// Redis cache with TTL configuration
const cache = derive(
  appConfig,
  (cfg) =>
    new RedisClient({
      url: cfg.redis.url,
      defaultTTL: cfg.redis.ttl,
    })
);

// Monitoring service with conditional enablement
const monitoring = derive(appConfig, (cfg) =>
  cfg.monitoring.enabled
    ? new MonitoringService(cfg.monitoring.endpoint)
    : new NoOpMonitoringService()
);

// Health check service with dependency validation
const healthCheck = derive(
  [database, cache, monitoring],
  ([db, redis, monitor]) => ({
    async checkHealth(): Promise<HealthStatus> {
      const checks = await Promise.allSettled([
        db.ping().then(() => ({ service: "database", status: "healthy" })),
        redis.ping().then(() => ({ service: "cache", status: "healthy" })),
        monitor
          .ping()
          .then(() => ({ service: "monitoring", status: "healthy" })),
      ]);

      const results = checks.map((check) =>
        check.status === "fulfilled"
          ? check.value
          : { service: "unknown", status: "unhealthy" }
      );

      return {
        overall: results.every((r) => r.status === "healthy")
          ? "healthy"
          : "degraded",
        services: results,
        timestamp: new Date().toISOString(),
      };
    },
  })
);

// Express server with all dependencies
const server = derive([appConfig, healthCheck], ([cfg, health]) => {
  const app = express();

  app.get("/health", async (req, res) => {
    const status = await health.checkHealth();
    res.status(status.overall === "healthy" ? 200 : 503).json(status);
  });

  return app.listen(cfg.port, () => {
    console.log(`Server running on port ${cfg.port} in ${cfg.env} mode`);
  });
});

// Production deployment
const scope = createScope();
const app = await scope.resolve(server);
//    ^^^ Type: Server - fully configured with all dependencies
```

**Production benefits:**

- **Environment configuration** - type-safe config with validation
- **Dependency health checks** - automatic service monitoring
- **Graceful degradation** - conditional service enablement
- **Type-safe deployment** - all environment variables validated

## What You Can Build

**Real-world applications using these patterns:**

- 🏢 **Enterprise APIs** - Microservice architectures with full type safety
- 🌐 **Full-stack applications** - Next.js/React apps with service coordination
- 📱 **Mobile backends** - Node.js APIs with dependency injection
- 🔄 **Event-driven systems** - Message queues and reactive services
- 🧪 **Testing frameworks** - Type-safe test utilities and mocks

## Next Steps

::: info 🚀 Quick Start
New to Pumped Functions? Start with our 5-minute tutorial.

[Tutorial →](./getting-started/quickstart)
:::

::: info ❓ Get Help
Common questions about migration, bundle size, and performance.

[FAQ →](./faq)
:::

**Ready to build?** Copy these examples and start with compile-time guarantees for your entire service architecture.
