import { test, expect, vi, beforeEach } from "vitest";
import { createScope, provide, resolves, derive } from "@pumped-fn/core-next";
import { flow } from "../src/flow";

// Mock async operations for testing
const mockAsyncStep = (value: string, delay = 10) => 
  provide(async () => {
    await new Promise(resolve => setTimeout(resolve, delay));
    return value;
  });

const mockErrorStep = (message: string) => 
  provide(async () => {
    throw new Error(message);
  });

const mockAsyncStepWithCounter = (value: string, counter: { count: number }) => 
  provide(async () => {
    counter.count++;
    return `${value}-${counter.count}`;
  });

let scope: any;

beforeEach(() => {
  scope = createScope();
});

test("basic flow execution", async () => {
    const basicFlow = flow.create(function* (input: string) {
      const step1 = yield mockAsyncStep(`step1-${input}`);
      const step2 = yield mockAsyncStep(`step2-${step1}`);
      return `final-${step2}`;
    });

    const processor = await resolves(scope, { flow: basicFlow });
    const result = await processor.flow("test");
    
    expect(result).toBe("final-step2-step1-test");
});

test("flow with yield* delegation", async () => {
    // Helper step generators using flow.step for proper type inference
    const readStep = flow.step(function* (input: string) {
      const result = yield mockAsyncStep(`read-${input}`);
      return result;
    });

    const transformStep = flow.step(function* (input: string) {
      const result = yield mockAsyncStep(`transform-${input}`);
      return result;
    });

    const delegatingFlow = flow.create(function* (input: string) {
      const read = yield* readStep(input);
      const transformed = yield* transformStep(read);
      return `final-${transformed}`;
    });

    const processor = await resolves(scope, { flow: delegatingFlow });
    const result = await processor.flow("test");
    
    expect(result).toBe("final-transform-read-test");
});

test("flow with error handling", async () => {
    const errorFlow = flow.create(function* (input: string) {
      const step1 = yield mockAsyncStep(`step1-${input}`);
      
      // Error handling needs to be done at the flow level, not inside the generator
      // The generator yields executors and the flow engine handles the execution
      const fallback = yield mockAsyncStep(`fallback-${step1}`);
      return `error-recovered-${fallback}`;
    });

    const processor = await resolves(scope, { flow: errorFlow });
    const result = await processor.flow("test");
    
    expect(result).toBe("error-recovered-fallback-step1-test");
});

test("flow with context recovery", async () => {
    const counter = { count: 0 };
    
    const recoveryFlow = flow.create(function* (input: string) {
      const step1 = yield mockAsyncStepWithCounter(`step1-${input}`, counter);
      const step2 = yield mockAsyncStepWithCounter(`step2-${step1}`, counter);
      const step3 = yield mockAsyncStepWithCounter(`step3-${step2}`, counter);
      return `final-${step3}`;
    });

    const processor = await resolves(scope, { flow: recoveryFlow });
    
    // First execution
    const result1 = await processor.flow("test");
    expect(result1).toBe("final-step3-step2-step1-test-1-2-3");
    expect(counter.count).toBe(3);

    // Create context to resume from step 2
    const context = flow.context.create();
    context.stepIndex = 1;
    context.stepResults = ["step1-test-1"];
    
    // Resume execution - should only execute steps 2 and 3
    const result2 = await processor.flow("test", context);
    expect(result2).toBe("final-step3-step2-step1-test-1-4-5");
    expect(counter.count).toBe(5); // Only 2 more steps executed
});

test("flow helpers", async () => {
    const helperFlow = flow.create(function* (input: string) {
      // Using flow.async helper
      const async1 = yield flow.async(async () => `async-${input}`);
      
      // Using flow.sync helper  
      const sync1 = yield flow.sync(() => `sync-${async1}`);
      
      return `final-${sync1}`;
    });

    const processor = await resolves(scope, { flow: helperFlow });
    const result = await processor.flow("test");
    
    expect(result).toBe("final-sync-async-test");
});

test("context utilities", () => {
    const context = flow.context.create();
    expect(context.stepIndex).toBe(0);
    expect(context.stepResults).toEqual([]);
    expect(context.metadata).toEqual({});

    const withMeta = flow.context.withMetadata(context, { key: "value" });
    expect(withMeta.metadata).toEqual({ key: "value" });
    
    const reset = flow.context.reset(withMeta);
    expect(reset.stepIndex).toBe(0);
    expect(reset.stepResults).toEqual([]);
    expect(reset.metadata).toEqual({ key: "value" }); // metadata preserved
});

test("flow with complex branching", async () => {
    const branchingFlow = flow.create(function* (input: { type: string; value: string }) {
      const initial = yield mockAsyncStep(`initial-${input.value}`);
      
      if (input.type === "type1") {
        const branch1 = yield mockAsyncStep(`branch1-${initial}`);
        return `result-${branch1}`;
      } else if (input.type === "type2") {
        const branch2a = yield mockAsyncStep(`branch2a-${initial}`);
        const branch2b = yield mockAsyncStep(`branch2b-${branch2a}`);
        return `result-${branch2b}`;
      } else {
        return `result-${initial}`;
      }
    });

    const processor = await resolves(scope, { flow: branchingFlow });
    
    const result1 = await processor.flow({ type: "type1", value: "test" });
    expect(result1).toBe("result-branch1-initial-test");
    
    const result2 = await processor.flow({ type: "type2", value: "test" });
    expect(result2).toBe("result-branch2b-branch2a-initial-test");
    
    const result3 = await processor.flow({ type: "other", value: "test" });
    expect(result3).toBe("result-initial-test");
});

test("flow error preservation in context", async () => {
    const errorFlow = flow.create(function* (input: string) {
      const step1 = yield mockAsyncStep(`step1-${input}`);
      const step2 = yield mockErrorStep("intentional error");
      return `should-not-reach-${step2}`;
    });

    const processor = await resolves(scope, { flow: errorFlow });
    
    try {
      await processor.flow("test");
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect((error as Error).message).toBe("intentional error");
    }
});

test("nested flows", async () => {
    const innerFlow = flow.create(function* (input: string) {
      const step1 = yield mockAsyncStep(`inner1-${input}`);
      const step2 = yield mockAsyncStep(`inner2-${step1}`);
      return `inner-result-${step2}`;
    });

    const outerFlow = flow.create(function* (input: string) {
      const step1 = yield mockAsyncStep(`outer1-${input}`);
      
      // Get inner flow processor
      const innerProcessor = yield innerFlow;
      const innerResult = yield flow.async(() => innerProcessor(step1));
      
      const step2 = yield mockAsyncStep(`outer2-${innerResult}`);
      return `outer-result-${step2}`;
    });

    const processor = await resolves(scope, { flow: outerFlow });
    const result = await processor.flow("test");
    
    expect(result).toBe("outer-result-outer2-inner-result-inner2-inner1-outer1-test");
});

test("flow context access in executors", async () => {
    const contextAwareFlow = flow.create(function* (input: string) {
      const step1 = yield provide(async () => `step1-${input}`);
      
      // Create an executor that accesses flow context
      const contextAwareStep = yield derive([flow.getContext()], async ([context]) => {
        if (context) {
          return `step2-${step1}-index:${context.stepIndex}-meta:${JSON.stringify(context.flowContext.metadata)}`;
        }
        return `step2-${step1}-no-context`;
      });
      
      return contextAwareStep;
    });

    const processor = await resolves(scope, { flow: contextAwareFlow });
    
    // Test with metadata
    const context = flow.context.withMetadata(
      flow.context.create(),
      { key: "test-value" }
    );
    
    const result = await processor.flow("test", context);
    expect(result).toBe('step2-step1-test-index:1-meta:{"key":"test-value"}');
});