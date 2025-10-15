import { createScope, provide, derive } from "../dist/index.js";
import { performance } from "perf_hooks";

const iterations = 1000;

const benchmarks = {
  "Simple executor resolution": async () => {
    const executor = provide(() => ({ value: 42 }));
    const scope = createScope();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await scope.resolve(executor);
    }
    const end = performance.now();

    await scope.dispose();
    return end - start;
  },

  "Cached executor resolution (hot path)": async () => {
    const executor = provide(() => ({ value: 42 }));
    const scope = createScope();
    await scope.resolve(executor);

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await scope.resolve(executor);
    }
    const end = performance.now();

    await scope.dispose();
    return end - start;
  },

  "Nested dependency resolution": async () => {
    const a = provide(() => 1);
    const b = derive({ a }, ({ a }) => a + 1);
    const c = derive({ b }, ({ b }) => b + 1);
    const d = derive({ c }, ({ c }) => c + 1);

    const scope = createScope();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await scope.resolve(d);
    }
    const end = performance.now();

    await scope.dispose();
    return end - start;
  },

  "Object dependency resolution": async () => {
    const a = provide(() => 1);
    const b = provide(() => 2);
    const c = provide(() => 3);
    const combined = derive({ a, b, c }, (deps) => deps.a + deps.b + deps.c);

    const scope = createScope();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await scope.resolve(combined);
    }
    const end = performance.now();

    await scope.dispose();
    return end - start;
  },

  "Multiple scopes with extensions": async () => {
    const executor = provide(() => ({ value: 42 }));
    const extension = {
      name: "test-extension",
      wrap: (dataStore, next) => next(),
    };

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const scope = createScope();
      scope.useExtension(extension);
      await scope.resolve(executor);
      await scope.dispose();
    }
    const end = performance.now();

    return end - start;
  },

  "Memory allocation (scope + resolve + dispose)": async () => {
    const executor = provide(() => ({ value: 42, data: new Array(100).fill(0) }));

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const scope = createScope();
      await scope.resolve(executor);
      await scope.dispose();
    }
    const end = performance.now();

    return end - start;
  },
};

async function runBenchmarks() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("  Pumped-FN Performance Benchmark");
  console.log(`  Iterations: ${iterations}`);
  console.log(`${"=".repeat(60)}\n`);

  const results = [];

  for (const [name, benchmark] of Object.entries(benchmarks)) {
    console.log(`Running: ${name}...`);

    const warmupTime = await benchmark();
    console.log(`  Warmup: ${warmupTime.toFixed(2)}ms`);

    const times = [];
    for (let i = 0; i < 5; i++) {
      const time = await benchmark();
      times.push(time);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const opsPerSec = (iterations / (avgTime / 1000)).toFixed(0);

    results.push({
      name,
      avgTime,
      minTime,
      maxTime,
      opsPerSec,
    });

    console.log(`  Average: ${avgTime.toFixed(2)}ms`);
    console.log(`  Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
    console.log(`  Throughput: ${opsPerSec} ops/sec\n`);
  }

  console.log(`${"=".repeat(60)}`);
  console.log("  Summary");
  console.log(`${"=".repeat(60)}\n`);

  console.table(
    results.map((r) => ({
      Benchmark: r.name,
      "Avg (ms)": r.avgTime.toFixed(2),
      "Min (ms)": r.minTime.toFixed(2),
      "Max (ms)": r.maxTime.toFixed(2),
      "Ops/sec": r.opsPerSec,
    }))
  );

  console.log(`\n${"=".repeat(60)}\n`);
}

runBenchmarks().catch(console.error);
