import {
  type Core,
  type Meta,
  type StandardSchemaV1,
  meta,
  plugin,
  preset,
} from "@pumped-fn/core-next";

export declare namespace Telemetry {
  export interface Span {
    id: string;
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    attributes: Record<string, unknown>;
    status: "pending" | "success" | "error";
    error?: Error;
    parentId?: string;
  }

  export interface Event {
    timestamp: number;
    type: "execute" | "update" | "error";
    executorName: string;
    span: Span;
    parameters?: unknown;
    result?: unknown;
    metadata: Record<string, unknown>;
  }

  export interface Adapter {
    onEvent(event: Event): void | Promise<void>;
    flush?(): void | Promise<void>;
  }

  export interface Config {
    enabled?: boolean;
    adapter?: Adapter;
    sampling?: {
      rate: number; // 0-1, where 1 means sample everything
      strategy?: "random" | "deterministic";
    };
    performance?: {
      captureStackTraces?: boolean;
      maxSpanDuration?: number; // ms, spans longer than this will be flagged
    };
    privacy?: {
      redactParameters?: boolean | string[]; // true = all, array = specific param names
      redactResults?: boolean | string[];
      redactionPlaceholder?: string;
    };
    batching?: {
      enabled?: boolean;
      flushInterval?: number; // ms
      maxBatchSize?: number;
    };
  }

  export interface MetaConfig {
    name?: string;
    category?: string;
    sensitive?: boolean;
    skipTelemetry?: boolean;
    customAttributes?: Record<string, unknown>;
  }
}

// Built-in adapters
class ConsoleTelemetryAdapter implements Telemetry.Adapter {
  constructor(private options: { pretty?: boolean } = {}) {}

  onEvent(event: Telemetry.Event): void {
    const output = this.options.pretty
      ? JSON.stringify(event, null, 2)
      : JSON.stringify(event);
    console.log(`[TELEMETRY] ${output}`);
  }
}

class FileTelemetryAdapter implements Telemetry.Adapter {
  private buffer: Telemetry.Event[] = [];
  
  constructor(
    private options: {
      filePath: string;
      bufferSize?: number;
      append?: boolean;
    }
  ) {}

  async onEvent(event: Telemetry.Event): Promise<void> {
    this.buffer.push(event);
    
    if (this.buffer.length >= (this.options.bufferSize ?? 100)) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const { writeFile, appendFile, readFile } = await import("fs/promises");
    const data = this.buffer.map(e => JSON.stringify(e)).join("\n") + "\n";
    
    if (this.options.append) {
      await appendFile(this.options.filePath, data);
    } else {
      // Read existing, append, and write back
      try {
        const existing = await readFile(this.options.filePath, "utf-8");
        await writeFile(this.options.filePath, existing + data);
      } catch {
        await writeFile(this.options.filePath, data);
      }
    }
    
    this.buffer = [];
  }
}

// Simple schema for telemetry meta
const telemetrySchema: StandardSchemaV1<Telemetry.MetaConfig> = {
  "~standard": {
    version: 1,
    vendor: "pumped-fn",
    validate: (value) => ({ value: value as any }),
  },
};

// Telemetry context
class TelemetryContext {
  private spans = new Map<string, Telemetry.Span>();
  private activeSpanId?: string;
  
  constructor(
    private config: Required<Telemetry.Config>,
    private adapter: Telemetry.Adapter
  ) {}

  createSpan(name: string, attributes: Record<string, unknown> = {}): Telemetry.Span {
    const span: Telemetry.Span = {
      id: Math.random().toString(36).substring(2, 15),
      name,
      startTime: performance.now(),
      attributes,
      status: "pending",
      parentId: this.activeSpanId,
    };
    
    this.spans.set(span.id, span);
    return span;
  }

  enterSpan(spanId: string): void {
    this.activeSpanId = spanId;
  }

  exitSpan(): void {
    const span = this.activeSpanId ? this.spans.get(this.activeSpanId) : undefined;
    this.activeSpanId = span?.parentId;
  }

  completeSpan(spanId: string, status: "success" | "error", error?: Error): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    
    span.endTime = performance.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    span.error = error;
    
    // Check for long-running spans
    if (
      this.config.performance.maxSpanDuration &&
      span.duration > this.config.performance.maxSpanDuration
    ) {
      span.attributes.slowSpan = true;
    }
  }

  shouldSample(): boolean {
    if (!this.config.sampling) return true;
    
    const { rate, strategy } = this.config.sampling;
    if (rate >= 1) return true;
    if (rate <= 0) return false;
    
    return strategy === "deterministic"
      ? (this.activeSpanId?.charCodeAt(0) ?? 0) / 255 < rate
      : Math.random() < rate;
  }

  redactValue(value: unknown, rules?: boolean | string[]): unknown {
    if (!rules) return value;
    
    const placeholder = this.config.privacy.redactionPlaceholder;
    
    if (rules === true) {
      return placeholder;
    }
    
    if (Array.isArray(rules)) {
      // Handle arrays (function parameters)
      if (Array.isArray(value)) {
        return value.map(item => this.redactValue(item, rules));
      }
      
      // Handle objects
      if (typeof value === "object" && value !== null) {
        const result = { ...value } as any;
        for (const key of rules) {
          if (key in result) {
            result[key] = placeholder;
          }
        }
        return result;
      }
    }
    
    return value;
  }

  async emitEvent(event: Telemetry.Event): Promise<void> {
    if (!this.shouldSample()) return;
    
    // Apply privacy rules
    if (event.parameters !== undefined) {
      event.parameters = this.redactValue(
        event.parameters,
        this.config.privacy.redactParameters
      );
    }
    
    if (event.result !== undefined) {
      event.result = this.redactValue(
        event.result,
        this.config.privacy.redactResults
      );
    }
    
    await this.adapter.onEvent(event);
  }

  getSpan(spanId: string): Telemetry.Span | undefined {
    return this.spans.get(spanId);
  }
}

// Proxy wrapper for telemetry
function createTelemetryProxy<T>(
  value: T,
  context: TelemetryContext,
  executorName: string,
  metadata: Record<string, unknown>
): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return new Proxy(value as any, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      
      if (typeof original === "function") {
        return new Proxy(original, {
          apply(fn, thisArg, args) {
            const span = context.createSpan(`${executorName}.${String(prop)}`, {
              executor: executorName,
              method: String(prop),
              ...metadata,
            });
            
            context.enterSpan(span.id);
            
            try {
              const result = Reflect.apply(fn, thisArg, args);
              
              // Handle async functions
              if (result instanceof Promise) {
                return result
                  .then((value) => {
                    context.completeSpan(span.id, "success");
                    context.emitEvent({
                      timestamp: Date.now(),
                      type: "execute",
                      executorName,
                      span,
                      parameters: args,
                      result: value,
                      metadata,
                    });
                    return value;
                  })
                  .catch((error) => {
                    context.completeSpan(span.id, "error", error);
                    context.emitEvent({
                      timestamp: Date.now(),
                      type: "error",
                      executorName,
                      span,
                      parameters: args,
                      metadata,
                    });
                    throw error;
                  })
                  .finally(() => {
                    context.exitSpan();
                  });
              }
              
              // Sync execution
              context.completeSpan(span.id, "success");
              context.emitEvent({
                timestamp: Date.now(),
                type: "execute",
                executorName,
                span,
                parameters: args,
                result,
                metadata,
              });
              context.exitSpan();
              
              return result;
            } catch (error) {
              context.completeSpan(span.id, "error", error as Error);
              context.emitEvent({
                timestamp: Date.now(),
                type: "error",
                executorName,
                span,
                parameters: args,
                metadata,
              });
              context.exitSpan();
              throw error;
            }
          },
        });
      }
      
      return original;
    },
  }) as T;
}

// Main telemetry API
export const telemetry = {
  middleware: (config: Telemetry.Config = {}): Core.Plugin => {
    const defaultConfig: Required<Telemetry.Config> = {
      enabled: config.enabled ?? true,
      adapter: config.adapter ?? telemetry.console(),
      sampling: config.sampling ?? { rate: 1, strategy: "random" },
      performance: {
        captureStackTraces: false,
        maxSpanDuration: 5000,
        ...config.performance,
      },
      privacy: {
        redactParameters: false,
        redactResults: false,
        redactionPlaceholder: "[REDACTED]",
        ...config.privacy,
      },
      batching: {
        enabled: false,
        flushInterval: 1000,
        maxBatchSize: 100,
        ...config.batching,
      },
    };

    if (!defaultConfig.enabled) {
      return plugin({
        init: () => {},
        dispose: async () => {},
      });
    }

    const context = new TelemetryContext(defaultConfig, defaultConfig.adapter);
    let flushInterval: NodeJS.Timeout | undefined;

    return plugin({
      init: (scope) => {
        // Set up batching if enabled
        if (defaultConfig.batching.enabled) {
          flushInterval = setInterval(async () => {
            await defaultConfig.adapter.flush?.();
          }, defaultConfig.batching.flushInterval);
        }

        // Hook into scope events
        scope.onChange((event, executor, value, scope) => {
          // Check if telemetry should be skipped for this executor
          const telemetryConfig = telemetry.meta.find(executor);
          if (telemetryConfig?.skipTelemetry) {
            return;
          }

          // Extract metadata
          const metadata: Record<string, unknown> = {
            event,
            ...(telemetryConfig?.customAttributes ?? {}),
          };

          if (telemetryConfig?.name) {
            metadata.name = telemetryConfig.name;
          }
          if (telemetryConfig?.category) {
            metadata.category = telemetryConfig.category;
          }
          if (telemetryConfig?.sensitive) {
            metadata.sensitive = true;
          }

          const executorName = telemetryConfig?.name ?? "executor";

          // Wrap the value in a telemetry proxy
          const wrappedValue = createTelemetryProxy(
            value,
            context,
            executorName,
            metadata
          );

          // Return a replacer to use the wrapped value
          return preset(executor, wrappedValue);
        });
      },

      dispose: async () => {
        // Clean up
        if (flushInterval) {
          clearInterval(flushInterval);
        }

        // Final flush
        await defaultConfig.adapter.flush?.();
      },
    });
  },

  meta: meta("pumped-fn:telemetry", telemetrySchema),

  console: (options: { pretty?: boolean } = {}): Telemetry.Adapter =>
    new ConsoleTelemetryAdapter(options),

  file: (options: {
    filePath: string;
    bufferSize?: number;
    append?: boolean;
  }): Telemetry.Adapter => new FileTelemetryAdapter(options),
} as const;

