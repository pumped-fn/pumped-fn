import { createScope, provide, derive } from "../dist/index.js";
import { flow } from "../dist/index.js";

const iterations = 100;

function getMemoryUsage() {
  if (global.gc) {
    global.gc();
  }
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed / 1024 / 1024,
    external: usage.external / 1024 / 1024,
  };
}

const memoryBenchmarks = {
  "Scope creation and disposal": async () => {
    const before = getMemoryUsage();

    for (let i = 0; i < iterations; i++) {
      const scope = createScope();
      await scope.dispose();
    }

    const after = getMemoryUsage();
    return {
      heapDiff: after.heapUsed - before.heapUsed,
      externalDiff: after.external - before.external,
    };
  },

  "Executor resolution (cached)": async () => {
    const executor = provide(() => ({ value: 42 }));
    const scope = createScope();
    await scope.resolve(executor);

    const before = getMemoryUsage();

    for (let i = 0; i < iterations; i++) {
      await scope.resolve(executor);
    }

    const after = getMemoryUsage();
    await scope.dispose();

    return {
      heapDiff: after.heapUsed - before.heapUsed,
      externalDiff: after.external - before.external,
    };
  },

  "Promised wrapper allocations": async () => {
    const executor = provide(() => ({ value: 42 }));
    const scope = createScope();
    await scope.resolve(executor);

    const before = getMemoryUsage();

    for (let i = 0; i < iterations * 10; i++) {
      await scope.resolve(executor);
    }

    const after = getMemoryUsage();
    await scope.dispose();

    return {
      heapDiff: after.heapUsed - before.heapUsed,
      externalDiff: after.external - before.external,
    };
  },

  "Extension wrapper allocations": async () => {
    const executor = provide(() => ({ value: 42 }));
    const extension1 = { name: "ext1", wrap: (ds, next) => next() };
    const extension2 = { name: "ext2", wrap: (ds, next) => next() };
    const extension3 = { name: "ext3", wrap: (ds, next) => next() };

    const scope = createScope();
    scope.useExtension(extension1);
    scope.useExtension(extension2);
    scope.useExtension(extension3);

    const before = getMemoryUsage();

    for (let i = 0; i < iterations; i++) {
      await scope.resolve(executor);
    }

    const after = getMemoryUsage();
    await scope.dispose();

    return {
      heapDiff: after.heapUsed - before.heapUsed,
      externalDiff: after.external - before.external,
    };
  },

  "Flow execution without journaling": async () => {
    const testFlow = flow({
      name: "test-flow",
      handler: (ctx, input) => {
        return input * 2;
      },
    });

    const scope = createScope();

    const before = getMemoryUsage();

    for (let i = 0; i < iterations; i++) {
      await scope.exec(testFlow, 42);
    }

    const after = getMemoryUsage();
    await scope.dispose();

    return {
      heapDiff: after.heapUsed - before.heapUsed,
      externalDiff: after.external - before.external,
    };
  },

  "Flow execution with journaling": async () => {
    const testFlow = flow({
      name: "test-flow-journal",
      handler: async (ctx, input) => {
        await ctx.run("step1", () => input * 2);
        await ctx.run("step2", () => input * 3);
        return input * 4;
      },
    });

    const scope = createScope();

    const before = getMemoryUsage();

    for (let i = 0; i < iterations; i++) {
      await scope.exec(testFlow, 42);
    }

    const after = getMemoryUsage();
    await scope.dispose();

    return {
      heapDiff: after.heapUsed - before.heapUsed,
      externalDiff: after.external - before.external,
    };
  },
};

async function runMemoryBenchmarks() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Pumped-FN Memory Benchmark");
  console.log(`  Iterations: ${iterations}`);
  console.log(`  Note: Run with --expose-gc for accurate results`);
  console.log(`${"=".repeat(60)}\n`);

  if (!global.gc) {
    console.warn("⚠️  Warning: GC not exposed. Run with --expose-gc flag\n");
  }

  const results = [];

  for (const [name, benchmark] of Object.entries(memoryBenchmarks)) {
    console.log(`Running: ${name}...`);

    await benchmark();

    const runs = [];
    for (let i = 0; i < 3; i++) {
      const result = await benchmark();
      runs.push(result);
    }

    const avgHeap =
      runs.reduce((sum, r) => sum + r.heapDiff, 0) / runs.length;
    const avgExternal =
      runs.reduce((sum, r) => sum + r.externalDiff, 0) / runs.length;

    results.push({
      name,
      heapPerOp: (avgHeap / iterations).toFixed(3),
      externalPerOp: (avgExternal / iterations).toFixed(3),
      totalHeap: avgHeap.toFixed(2),
    });

    console.log(`  Heap: ${avgHeap.toFixed(2)} MB`);
    console.log(`  Per operation: ${(avgHeap / iterations).toFixed(3)} MB\n`);
  }

  console.log(`${"=".repeat(60)}`);
  console.log("  Summary (Lower is better)");
  console.log(`${"=".repeat(60)}\n`);

  console.table(
    results.map((r) => ({
      Benchmark: r.name,
      "Heap/Op (MB)": r.heapPerOp,
      "External/Op (MB)": r.externalPerOp,
      "Total Heap (MB)": r.totalHeap,
    }))
  );

  console.log(`\n${"=".repeat(60)}\n`);
}

runMemoryBenchmarks().catch(console.error);
