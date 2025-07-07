# Flow Concept

The Flow concept in `@pumped-fn/extra` provides a simple, generator-based approach to building sequential workflows that integrate seamlessly with the core dependency resolution system.

## Key Features

- **Generator-based**: Uses JavaScript generators for intuitive, sequential code flow
- **Core Integration**: Leverages pumped-fn's executor and scope system
- **Durable Execution**: Supports resumable flows with context preservation
- **Type-safe**: Full TypeScript support with type inference
- **Composable**: Flows can be nested and combined using `yield*`

## Basic Usage

```typescript
import { flow } from "@pumped-fn/extra";
import { createScope, provide, resolves } from "@pumped-fn/core-next";

// Define a simple flow
const myFlow = flow.create(function* (input: string) {
  // Each yield statement resolves an executor
  const step1 = yield provide(async () => `processed-${input}`);
  const step2 = yield provide(async () => `final-${step1}`);
  
  return step2;
});

// Execute the flow
const scope = createScope();
const processor = await resolves(scope, { flow: myFlow });
const result = await processor.flow("test");
// Result: "final-processed-test"
```

## Flow with Error Handling and Recovery

```typescript
const resilientFlow = flow.create(function* (input: string) {
  const step1 = yield someExecutor(input);
  const step2 = yield anotherExecutor(step1);
  const step3 = yield finalExecutor(step2);
  
  return step3;
});

// Execute with context for recovery
const context = flow.context.create();
context.stepIndex = 1; // Resume from step 2
context.stepResults = ["step1-result"];

const result = await processor.flow("input", context);
```

## Delegation with yield*

```typescript
// Helper flow with proper type inference using flow.step
const validateStep = flow.step(function* (data: string) {
  const validation = yield validationExecutor(data);
  return validation; // TypeScript properly infers the return type
});

// Main flow using delegation
const mainFlow = flow.create(function* (input: string) {
  // Delegate to helper flow - types are preserved
  const validated = yield* validateStep(input);
  
  const processed = yield processingExecutor(validated);
  return processed;
});
```

## Accessing Flow Context (SPI)

Executors can access the current flow context for advanced use cases:

```typescript
const contextAwareExecutor = derive([flow.getContext()], async ([context]) => {
  if (context) {
    console.log(`Current step: ${context.stepIndex}`);
    console.log(`Flow metadata:`, context.flowContext.metadata);
    
    // Access previous step results
    const previousResults = context.flowContext.stepResults;
    
    return `Processed at step ${context.stepIndex}`;
  }
  return "No context available";
});

const flowWithContext = flow.create(function* (input: string) {
  const step1 = yield someExecutor(input);
  const step2 = yield contextAwareExecutor; // Can access flow context
  return step2;
});
```

## Key Benefits

1. **Simple**: No complex state machines or configuration
2. **Readable**: Sequential code that reads like regular async functions
3. **Integrated**: Uses existing pumped-fn patterns and lifecycle management
4. **Resilient**: Built-in support for error recovery and resumption
5. **Efficient**: Leverages core-next's dependency resolution and cleanup

## When to Use

- Multi-step processes that need to be resumable
- Workflows that require error recovery
- Sequential operations with conditional logic
- Any process that benefits from step-by-step execution with context preservation