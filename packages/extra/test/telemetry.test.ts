import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { provide, createScope, derive } from "@pumped-fn/core-next";
import {
  telemetry,
  type Telemetry,
} from "../src/telemetry";

// Mock adapter for testing
class MockTelemetryAdapter implements Telemetry.Adapter {
  events: Telemetry.Event[] = [];
  flushCount = 0;

  async onEvent(event: Telemetry.Event): Promise<void> {
    this.events.push(event);
  }

  async flush(): Promise<void> {
    this.flushCount++;
  }

  clear(): void {
    this.events = [];
    this.flushCount = 0;
  }
}

describe("Telemetry Middleware", () => {
  let mockAdapter: MockTelemetryAdapter;

  beforeEach(() => {
    mockAdapter = new MockTelemetryAdapter();
  });

  afterEach(() => {
    mockAdapter.clear();
  });

  it("should capture function execution with timing", async () => {
    const middleware = telemetry.middleware({ adapter: mockAdapter });
    const s = createScope();
    s.use(middleware);

    const service = provide(() => ({
      add: (a: number, b: number) => a + b,
      multiply: (a: number, b: number) => a * b,
    }), telemetry.meta({ name: "mathService" }));

    const result = await s.resolve(service);
    const sum = result.add(2, 3);

    expect(sum).toBe(5);
    expect(mockAdapter.events).toHaveLength(1);

    const event = mockAdapter.events[0];
    expect(event.type).toBe("execute");
    expect(event.executorName).toBe("mathService");
    expect(event.span.name).toBe("mathService.add");
    expect(event.span.status).toBe("success");
    expect(event.span.duration).toBeGreaterThan(0);
    expect(event.parameters).toEqual([2, 3]);
    expect(event.result).toBe(5);
  });

  it("should handle async function execution", async () => {
    const middleware = telemetry.middleware({ adapter: mockAdapter });
    const s = createScope();
    s.use(middleware);

    const asyncService = provide(() => ({
      fetchData: async (id: string) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { id, data: "test" };
      },
    }), telemetry.meta({ name: "asyncService" }));

    const service = await s.resolve(asyncService);
    const result = await service.fetchData("123");

    expect(result).toEqual({ id: "123", data: "test" });
    expect(mockAdapter.events).toHaveLength(1);

    const event = mockAdapter.events[0];
    expect(event.type).toBe("execute");
    expect(event.span.duration).toBeGreaterThan(10);
    expect(event.parameters).toEqual(["123"]);
    expect(event.result).toEqual({ id: "123", data: "test" });
  });

  it("should capture errors", async () => {
    const middleware = telemetry.middleware({ adapter: mockAdapter });
    const s = createScope();
    s.use(middleware);

    const errorService = provide(() => ({
      throwError: () => {
        throw new Error("Test error");
      },
    }), telemetry.meta({ name: "errorService" }));

    const service = await s.resolve(errorService);
    
    expect(() => service.throwError()).toThrow("Test error");
    expect(mockAdapter.events).toHaveLength(1);

    const event = mockAdapter.events[0];
    expect(event.type).toBe("error");
    expect(event.span.status).toBe("error");
    expect(event.span.error?.message).toBe("Test error");
  });

  it("should respect skipTelemetry meta", async () => {
    const middleware = telemetry.middleware({ adapter: mockAdapter });
    const s = createScope();
    s.use(middleware);

    const skippedService = provide(() => ({
      secret: () => "should not be logged",
    }), telemetry.meta({ skipTelemetry: true }));

    const service = await s.resolve(skippedService);
    service.secret();

    expect(mockAdapter.events).toHaveLength(0);
  });

  it("should handle parameter redaction", async () => {
    const middleware = telemetry.middleware({
      adapter: mockAdapter,
      privacy: {
        redactParameters: true,
      },
    });
    const s = createScope();
    s.use(middleware);

    const service = provide(() => ({
      login: (username: string, password: string) => ({ success: true }),
    }));

    const result = await s.resolve(service);
    result.login("user123", "secret");

    expect(mockAdapter.events).toHaveLength(1);
    expect(mockAdapter.events[0].parameters).toBe("[REDACTED]");
  });

  it("should handle selective parameter redaction", async () => {
    const middleware = telemetry.middleware({
      adapter: mockAdapter,
      privacy: {
        redactParameters: ["password", "ssn"],
      },
    });
    const s = createScope();
    s.use(middleware);

    const service = provide(() => ({
      createUser: (data: { name: string; password: string; email: string }) => data,
    }));

    const result = await s.resolve(service);
    const userData = { name: "John", password: "secret", email: "john@example.com" };
    result.createUser(userData);

    expect(mockAdapter.events).toHaveLength(1);
    const capturedParams = mockAdapter.events[0].parameters as any[];
    expect(capturedParams[0]).toEqual({
      name: "John",
      password: "[REDACTED]",
      email: "john@example.com",
    });
  });

  it("should handle result redaction", async () => {
    const middleware = telemetry.middleware({
      adapter: mockAdapter,
      privacy: {
        redactResults: ["token", "apiKey"],
      },
    });
    const s = createScope();
    s.use(middleware);

    const service = provide(() => ({
      getCredentials: () => ({
        token: "secret-token",
        apiKey: "secret-key",
        userId: "123",
      }),
    }));

    const result = await s.resolve(service);
    result.getCredentials();

    expect(mockAdapter.events).toHaveLength(1);
    expect(mockAdapter.events[0].result).toEqual({
      token: "[REDACTED]",
      apiKey: "[REDACTED]",
      userId: "123",
    });
  });

  it("should respect sampling configuration", async () => {
    const middleware = telemetry.middleware({
      adapter: mockAdapter,
      sampling: {
        rate: 0, // Never sample
      },
    });
    const s = createScope();
    s.use(middleware);

    const service = provide(() => ({
      test: () => "result",
    }));

    const result = await s.resolve(service);
    result.test();

    expect(mockAdapter.events).toHaveLength(0);
  });

  it("should handle nested spans", async () => {
    const middleware = telemetry.middleware({ adapter: mockAdapter });
    const s = createScope();
    s.use(middleware);

    const serviceA = provide(() => ({
      methodA: () => "A",
    }), telemetry.meta({ name: "serviceA" }));

    const serviceB = derive([serviceA], ([a]) => ({
      methodB: () => {
        const resultA = a.methodA();
        return `B-${resultA}`;
      },
    }), telemetry.meta({ name: "serviceB" }));

    const b = await s.resolve(serviceB);
    const result = b.methodB();

    expect(result).toBe("B-A");
    expect(mockAdapter.events).toHaveLength(2);

    // Check parent-child relationship
    const eventA = mockAdapter.events.find(e => e.span.name === "serviceA.methodA");
    const eventB = mockAdapter.events.find(e => e.span.name === "serviceB.methodB");
    
    expect(eventA).toBeDefined();
    expect(eventB).toBeDefined();
    expect(eventA!.span.parentId).toBe(eventB!.span.id);
  });

  it("should include custom attributes from meta", async () => {
    const middleware = telemetry.middleware({ adapter: mockAdapter });
    const s = createScope();
    s.use(middleware);

    const service = provide(() => ({
      process: (data: string) => data.toUpperCase(),
    }), telemetry.meta({
      name: "dataProcessor",
      category: "transformation",
      customAttributes: {
        version: "1.0.0",
        team: "backend",
      },
    }));

    const result = await s.resolve(service);
    result.process("hello");

    expect(mockAdapter.events).toHaveLength(1);
    const event = mockAdapter.events[0];
    expect(event.metadata).toMatchObject({
      category: "transformation",
      version: "1.0.0",
      team: "backend",
    });
  });

  it("should flag slow spans", async () => {
    const middleware = telemetry.middleware({
      adapter: mockAdapter,
      performance: {
        maxSpanDuration: 5, // 5ms
      },
    });
    const s = createScope();
    s.use(middleware);

    const slowService = provide(() => ({
      slowMethod: async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return "done";
      },
    }));

    const service = await s.resolve(slowService);
    await service.slowMethod();

    expect(mockAdapter.events).toHaveLength(1);
    expect(mockAdapter.events[0].span.attributes.slowSpan).toBe(true);
  });

  it("should handle batching with flush", async () => {
    const middleware = telemetry.middleware({
      adapter: mockAdapter,
      batching: {
        enabled: true,
        flushInterval: 100,
      },
    });
    const s = createScope();
    s.use(middleware);

    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(mockAdapter.flushCount).toBeGreaterThan(0);

    await s.dispose();
  });

  it("should work with console adapter", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    
    const middleware = telemetry.middleware({
      adapter: telemetry.console({ pretty: true }),
    });
    const s = createScope();
    s.use(middleware);

    const service = provide(() => ({
      test: () => "result",
    }));

    (await s.resolve(service)).test();

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain("[TELEMETRY]");
    
    consoleSpy.mockRestore();
  });

  it("should handle disabled telemetry", async () => {
    // Create a completely fresh adapter and scope
    const freshAdapter = new MockTelemetryAdapter();
    const freshScope = createScope();
    
    // Create middleware with telemetry disabled
    const disabledMiddleware = telemetry.middleware({
      adapter: freshAdapter,
      enabled: false,
    });
    
    freshScope.use(disabledMiddleware);

    const service = provide(() => ({
      test: () => "result",
    }));

    (await freshScope.resolve(service)).test();

    expect(freshAdapter.events).toHaveLength(0);
    
    // Clean up
    await freshScope.dispose();
  });
});