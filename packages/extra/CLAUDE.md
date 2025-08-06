# packages/extra/CLAUDE.md - Full-Stack Utilities (@pumped-fn/extra)

## When to Use This Context
- Building full-stack applications with client/server patterns
- Defining type-safe APIs with StandardSchema validation
- Implementing telemetry, logging, and monitoring
- Working with RPC-style communication patterns
- Advanced flow control and implicit dependency injection

## Package Structure

### Main Exports (`src/index.ts`)
```typescript
export * from "./core";      // API definition system
export * from "./client";    // Client-side utilities
export * from "./logger";    // Logging utilities
export * from "./telemetry"; // Telemetry and monitoring
```

### Core API System

#### File: `src/core.ts` - API Definition Framework
**Key Concepts:**
- **`Def.API<Input, Output>`** - Type-safe API definition interface
- **`Def.Service`** - Collection of related APIs
- **`Def.Stream<MI, MO, I, O>`** - Streaming/WebSocket API definitions
- **`Impl.API<Service, Key, Context>`** - Implementation interface
- **`Impl.Middleware<Context>`** - Middleware for request/response processing

**API Definition Pattern:**
```typescript
const define = {
  api<I, O>(api: Def.API<I, O>): typeof api,
  service<S extends Def.Service>(service: S): typeof service,
  stream<MI, MO, I, O>(stream: Def.Stream<MI, MO, I, O>): typeof stream
};
```

**Usage Example:**
```typescript
const userAPI = define.api({
  input: userInputSchema,
  output: userOutputSchema
});

const userService = define.service({
  create: userCreateAPI,
  read: userReadAPI,
  update: userUpdateAPI,
  delete: userDeleteAPI
});
```

### Client-Side Utilities

#### File: `src/client.ts` - Client Implementation Tools
- Client-side API consumers
- HTTP/fetch integration patterns
- Type-safe request/response handling
- Error handling and retry logic

### Advanced Flow Control

#### File: `src/flow.ts` - Enhanced Flow Patterns
- Advanced generator-based flow control
- Conditional execution patterns
- Error recovery flows
- Pipeline composition utilities

#### File: `src/implicit.ts` - Implicit Dependency Injection  
- Automatic dependency resolution
- Context-aware execution
- Implicit scope management
- Advanced executor composition

### Logging System

#### File: `src/logger.ts` - Structured Logging
- Structured logging utilities
- Log level management
- Context-aware logging
- Integration with executor system

**Key Features:**
- Standard log levels (debug, info, warn, error)
- Contextual metadata attachment
- Executor-aware logging contexts
- Configurable output formats

### Telemetry & Monitoring  

#### File: `src/telemetry.ts` - Application Monitoring
- Performance metrics collection
- Custom event tracking
- Executor resolution timing
- System health monitoring

**Telemetry Features:**
- Automatic executor resolution metrics
- Custom counter and gauge metrics
- Event timeline tracking
- Performance bottleneck detection

## Testing Infrastructure

### Test Files
- **`test/flow.test.ts`** - Flow control pattern testing
- **`test/implicit.test.ts`** - Implicit injection testing  
- **`test/syntax.test.ts`** - API syntax and validation
- **`test/telemetry.test.ts`** - Telemetry data collection

### Example Usage (`examples/telemetry-example.ts`)
Demonstrates real-world telemetry integration patterns with executors.

## Common Integration Patterns

### API Service Definition
```typescript
import { define } from '@pumped-fn/extra';

// Define API contract
const userAPI = define.api({
  input: z.object({ id: z.string() }),
  output: z.object({ name: z.string(), email: z.string() })
});

const userService = define.service({
  getUser: userAPI,
  // ... other endpoints
});
```

### Full-Stack Integration
```typescript
// Server-side implementation
const implementation: Impl.API<typeof userService, 'getUser', ServerContext> = {
  service: userService,
  path: 'getUser',
  def: userService.getUser,
  context: serverContextSchema,
  handler: async ({ context, input }) => {
    // Type-safe implementation
    const user = await context.db.user.findById(input.id);
    return { name: user.name, email: user.email };
  }
};

// Client-side usage
const client = createClient(userService);
const user = await client.getUser({ id: '123' }); // Fully typed
```

### Telemetry Integration
```typescript
import { telemetry } from '@pumped-fn/extra';

const metricsExecutor = provide(() => telemetry.createCollector());
const timedExecutor = derive(
  [metricsExecutor, dataExecutor],
  async (metrics, data) => {
    const timer = metrics.startTimer('data-processing');
    try {
      const result = await processData(data);
      timer.success();
      return result;
    } catch (error) {
      timer.error(error);
      throw error;
    }
  }
);
```

### Implicit Dependency Injection
```typescript
import { implicit } from '@pumped-fn/extra';

// Automatically resolve dependencies based on context
const smartExecutor = implicit.derive((context) => {
  // Context-aware dependency resolution
  const db = context.resolve(dbExecutor);
  const logger = context.resolve(loggerExecutor);
  
  return async (input) => {
    logger.info('Processing', { input });
    return await db.process(input);
  };
});
```

## Advanced Features

### Middleware System
```typescript
const authMiddleware: Impl.Middleware<Context> = async (input, next) => {
  if (!input.context.user) {
    throw new Error('Unauthorized');
  }
  return await next(input);
};
```

### Streaming APIs
```typescript
const chatStream = define.stream({
  id: 'chat-stream',
  input: messageInputSchema,
  output: messageOutputSchema,  
  messageIn: userMessageSchema,
  messageOut: assistantMessageSchema
});
```

## Build & Configuration
- **`tsconfig.json`** - TypeScript configuration
- **`tsup.config.ts`** - Build configuration (tsup bundler) 
- Dual exports for client/server environments
- StandardSchema integration for runtime validation
- Full ESM support with Node.js and browser compatibility