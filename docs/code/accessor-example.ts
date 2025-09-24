import { accessor, custom, flow, provide, derive } from "@pumped-fn/core-next";
import type { Extension } from "@pumped-fn/core-next";

/**
 * DataAccessor Example - Type-Safe Context Management
 *
 * Demonstrates using DataAccessor for Map-like data structures
 * with type safety, validation, and default values.
 */

// #region snippet
// Define domain-specific context accessors
const RequestContext = {
  TRACE_ID: accessor("trace.id", custom<string>()),
  USER_ID: accessor("user.id", custom<string>()),
  SESSION_ID: accessor("session.id", custom<string>()),
  REQUEST_TIME: accessor("request.time", custom<number>(), Date.now),
  USER_ROLE: accessor("user.role", custom<"admin" | "user" | "guest">(), "guest"),
  CORRELATION_ID: accessor("correlation.id", custom<string>())
};

// Extension state management with symbols
const MetricsAccessors = {
  EXECUTION_COUNT: accessor(
    Symbol.for("metrics.execution.count"),
    custom<number>(),
    0
  ),
  TOTAL_DURATION: accessor(
    Symbol.for("metrics.total.duration"),
    custom<number>(),
    0
  ),
  AVERAGE_DURATION: accessor(
    Symbol.for("metrics.average.duration"),
    custom<number>(),
    0
  )
};

// Database service with accessor-based configuration
const DatabaseConfig = {
  HOST: accessor("db.host", custom<string>(), "localhost"),
  PORT: accessor("db.port", custom<number>(), 5432),
  NAME: accessor("db.name", custom<string>()),
  TIMEOUT: accessor("db.timeout", custom<number>(), 30000),
  MAX_CONNECTIONS: accessor("db.maxConnections", custom<number>(), 10)
};

const database = provide((ctl) => {
  // Access configuration from scope context
  const config = ctl.scope; // Assume scope has config DataStore

  return {
    connect: async () => {
      const host = DatabaseConfig.HOST.find(config);
      const port = DatabaseConfig.PORT.find(config);
      const dbName = DatabaseConfig.NAME.get(config); // Required - throws if missing
      const timeout = DatabaseConfig.TIMEOUT.find(config);

      console.log(`Connecting to ${host}:${port}/${dbName} (timeout: ${timeout}ms)`);
      return { connected: true, database: dbName };
    },

    query: async (sql: string) => {
      return [{ id: 1, name: "John Doe" }];
    }
  };
});

// User service flow with context management
const userServiceFlow = flow.define({
  name: "user.service.process",
  input: custom<{ userId: string; action: string }>(),
  success: custom<{ result: string; processed: boolean }>(),
  error: custom<{ code: string; message: string }>()
});

const userServiceHandler = userServiceFlow.handler(
  { db: database },
  async ({ db }, ctx, input) => {
    // Type-safe context access (no any types)
    const traceId = RequestContext.TRACE_ID.get(ctx); // Required - throws if missing
    const sessionId = RequestContext.SESSION_ID.find(ctx); // Optional - undefined if missing
    const userRole = RequestContext.USER_ROLE.find(ctx); // Uses default "guest"
    const requestTime = RequestContext.REQUEST_TIME.find(ctx); // Uses Date.now()

    // Set context for tracking
    RequestContext.USER_ID.set(ctx, input.userId);
    RequestContext.CORRELATION_ID.set(ctx, `${traceId}-${Date.now()}`);

    // Process based on role
    if (userRole === "guest") {
      return ctx.ko({
        code: "INSUFFICIENT_PERMISSIONS",
        message: "Guest users cannot perform this action"
      });
    }

    // Simulate database operation
    const connection = await db.connect();
    const results = await db.query(`SELECT * FROM users WHERE id = '${input.userId}'`);

    return ctx.ok({
      result: `Processed ${input.action} for ${input.userId}`,
      processed: true
    });
  }
);

// Parent flow that sets up context
const processRequestFlow = flow.define({
  name: "request.process",
  input: custom<{ userId: string; action: string; sessionId: string }>(),
  success: custom<{ success: boolean; message: string }>(),
  error: custom<{ error: string }>()
});

const processRequestHandler = processRequestFlow.handler(async (ctx, input) => {
  // Set up parent-level context
  RequestContext.TRACE_ID.set(ctx, `trace-${Date.now()}`);
  RequestContext.SESSION_ID.set(ctx, input.sessionId);
  RequestContext.USER_ROLE.set(ctx, "admin"); // Assume admin for this example

  try {
    // Execute child flow - inherits parent context
    const result = await ctx.execute(userServiceHandler, {
      userId: input.userId,
      action: input.action
    });

    if (result.isKo()) {
      return ctx.ko({ error: result.data.message });
    }

    return ctx.ok({
      success: true,
      message: result.data.result
    });
  } catch (error) {
    return ctx.ko({ error: "Processing failed" });
  }
});

// Metrics extension using accessors
const metricsExtension = (): Extension.Extension & { getMetrics: (ctx: any) => any } => {
  return {
    name: "metrics",

    async wrapExecute(context, next, execution) {
      const start = Date.now();

      // Type-safe metrics access with defaults
      const execCount = MetricsAccessors.EXECUTION_COUNT.find(context);
      MetricsAccessors.EXECUTION_COUNT.set(context, execCount + 1);

      try {
        const result = await next();

        // Calculate and store metrics
        const duration = Date.now() - start;
        const totalDuration = MetricsAccessors.TOTAL_DURATION.find(context);
        const newTotal = totalDuration + duration;
        const newCount = MetricsAccessors.EXECUTION_COUNT.find(context);

        MetricsAccessors.TOTAL_DURATION.set(context, newTotal);
        MetricsAccessors.AVERAGE_DURATION.set(context, Math.round(newTotal / newCount));

        console.log(`Flow '${execution.flowName}' executed in ${duration}ms`);
        return result;
      } catch (error) {
        console.error(`Flow '${execution.flowName}' failed after ${Date.now() - start}ms:`, error);
        throw error;
      }
    },

    getMetrics(context: any) {
      return {
        executions: MetricsAccessors.EXECUTION_COUNT.find(context),
        totalDuration: MetricsAccessors.TOTAL_DURATION.find(context),
        averageDuration: MetricsAccessors.AVERAGE_DURATION.find(context)
      };
    }
  };
};

// Testing utilities
class TestContextBuilder {
  private context = new Map();

  withTrace(traceId: string) {
    RequestContext.TRACE_ID.set(this.context, traceId);
    return this;
  }

  withUser(userId: string, role: "admin" | "user" | "guest" = "user") {
    RequestContext.USER_ID.set(this.context, userId);
    RequestContext.USER_ROLE.set(this.context, role);
    return this;
  }

  withSession(sessionId: string) {
    RequestContext.SESSION_ID.set(this.context, sessionId);
    return this;
  }

  withDatabase(host: string, port: number, database: string) {
    DatabaseConfig.HOST.set(this.context, host);
    DatabaseConfig.PORT.set(this.context, port);
    DatabaseConfig.NAME.set(this.context, database);
    return this;
  }

  build() {
    return this.context;
  }

  // Get presets for flow execution
  getPresets() {
    const presets: Array<[symbol, unknown]> = [];

    // Add all set values as presets
    if (RequestContext.TRACE_ID.find(this.context)) {
      presets.push(RequestContext.TRACE_ID.preset(RequestContext.TRACE_ID.get(this.context)));
    }
    if (RequestContext.USER_ID.find(this.context)) {
      presets.push(RequestContext.USER_ID.preset(RequestContext.USER_ID.get(this.context)));
    }
    if (RequestContext.SESSION_ID.find(this.context)) {
      presets.push(RequestContext.SESSION_ID.preset(RequestContext.SESSION_ID.get(this.context)));
    }
    if (RequestContext.USER_ROLE.find(this.context)) {
      presets.push(RequestContext.USER_ROLE.preset(RequestContext.USER_ROLE.get(this.context)));
    }

    return presets;
  }
}

async function main() {
  console.log("=== DataAccessor Example ===");

  // Create metrics extension
  const metrics = metricsExtension();

  // Setup test context
  const testBuilder = new TestContextBuilder()
    .withTrace("example-trace-123")
    .withUser("user-456", "admin")
    .withSession("session-789")
    .withDatabase("localhost", 5432, "example_db");

  const initialContext = testBuilder.getPresets();

  console.log("\n=== Executing Flow with Context ===");

  // Execute flow with context
  const result = await flow.execute(processRequestHandler, {
    userId: "user-456",
    action: "update_profile",
    sessionId: "session-789"
  }, {
    initialContext,
    extensions: [metrics]
  });

  console.log("Result:", result);

  // Show metrics
  console.log("\n=== Execution Metrics ===");
  const testContext = testBuilder.build();
  console.log("Metrics:", metrics.getMetrics(testContext));

  console.log("\n=== Context State ===");
  console.log("Trace ID:", RequestContext.TRACE_ID.find(testContext));
  console.log("User ID:", RequestContext.USER_ID.find(testContext));
  console.log("User Role:", RequestContext.USER_ROLE.find(testContext));
  console.log("Session ID:", RequestContext.SESSION_ID.find(testContext));

  console.log("\n=== Database Configuration ===");
  console.log("DB Host:", DatabaseConfig.HOST.find(testContext));
  console.log("DB Port:", DatabaseConfig.PORT.find(testContext));
  console.log("DB Name:", DatabaseConfig.NAME.find(testContext));
  console.log("DB Timeout:", DatabaseConfig.TIMEOUT.find(testContext));
}
// #endregion snippet

main().catch(console.error);