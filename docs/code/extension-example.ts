import { provide, derive, createScope, extension, meta, custom } from "@pumped-fn/core-next";
import type { Extension } from "@pumped-fn/core-next";

/**
 * Extension Example - Performance Monitoring
 *
 * Shows how to build extensions for cross-cutting concerns
 */

// #region snippet
const performanceExtension = (): Extension.Extension & { getMetrics: () => any[] } => {
  const metrics = new Map();
  const executionTimes = new Map();

  return extension({
    name: "performance",

    // Track executor resolution performance
    async wrapResolve(next, context) {
      const executorName = context.executor.toString();
      const start = performance.now();

      try {
        const result = await next();
        const duration = performance.now() - start;

        metrics.set(executorName, {
          operation: context.operation,
          duration,
          success: true,
          timestamp: Date.now()
        });

        if (duration > 100) {
          console.warn(`Slow ${context.operation}: ${executorName} took ${duration.toFixed(2)}ms`);
        }

        return result;
      } catch (error) {
        const duration = performance.now() - start;
        metrics.set(executorName, {
          operation: context.operation,
          duration,
          error: error.message,
          timestamp: Date.now()
        });
        throw error;
      }
    },

    // Track flow execution performance
    async wrapExecute(context, next, execution) {
      const flowName = execution.flowName || 'unknown';
      const start = performance.now();

      try {
        const result = await next();
        const duration = performance.now() - start;

        const existing = executionTimes.get(flowName) || [];
        existing.push({ duration, success: true, timestamp: Date.now() });
        executionTimes.set(flowName, existing);

        console.log(`Flow '${flowName}' completed in ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        const duration = performance.now() - start;

        const existing = executionTimes.get(flowName) || [];
        existing.push({ duration, error: error.message, timestamp: Date.now() });
        executionTimes.set(flowName, existing);

        console.error(`Flow '${flowName}' failed after ${duration.toFixed(2)}ms:`, error.message);
        throw error;
      }
    },

    getMetrics() {
      return Array.from(metrics.entries()).map(([executor, data]) => ({
        executor,
        ...data
      }));
    }
  }) as Extension.Extension & { getMetrics: () => any[] };
};

// Meta-driven monitoring
const monitored = meta("monitored", custom<boolean>());
const logLevel = meta("log-level", custom<"debug" | "info" | "warn" | "error">());

const metaMonitoringExtension = (): Extension.Extension => extension({
  name: "meta-monitoring",

  init(scope) {
    scope.onChange((event, executor, value) => {
      const shouldMonitor = monitored.find(executor);
      const level = logLevel.find(executor) || "info";

      if (shouldMonitor && event === "resolve") {
        console.log(`[${level.toUpperCase()}] Resolved: ${executor.toString()}`);
      }
    });
  }
});

// Example application with monitored components
const config = provide(() => ({
  apiUrl: "https://api.example.com",
  timeout: 5000
}), monitored(true), logLevel("info"));

const httpClient = provide(() => ({
  get: async (path: string) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
    return { data: `Response for ${path}` };
  }
}), monitored(true), logLevel("debug"));

const userService = derive([config, httpClient], ([cfg, http]) => ({
  getUser: async (id: string) => {
    return await http.get(`/users/${id}`);
  },
  listUsers: async () => {
    return await http.get('/users');
  }
}), monitored(false)); // Not monitored

async function main() {
  const scope = createScope();

  // Register extensions
  const perfExt = performanceExtension();
  const metaExt = metaMonitoringExtension();

  scope.use(perfExt);
  scope.use(metaExt);

  console.log("=== Resolving components ===");
  const service = await scope.resolve(userService);

  console.log("\n=== Using service ===");
  const user = await service.getUser("123");
  const users = await service.listUsers();

  console.log("\n=== Performance Metrics ===");
  console.table(perfExt.getMetrics());

  await scope.dispose();
}
// #endregion snippet

main().catch(console.error);