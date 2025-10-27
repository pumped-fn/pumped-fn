import { createScope, provide } from "../dist/index.js";
import { performance } from "perf_hooks";

const iterations = 50000; // More iterations
const runs = 10; // Multiple runs

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(arr) {
  const avg = mean(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

async function singleRun() {
  const executor = provide(() => ({ value: 42 }));
  const scope = createScope();
  
  // Prime the cache
  await scope.resolve(executor);
  
  // Warmup
  for (let i = 0; i < 5000; i++) {
    await scope.resolve(executor);
  }
  
  // Clear V8 optimizations by forcing GC if available
  if (global.gc) global.gc();
  
  // Actual measurement
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await scope.resolve(executor);
  }
  const end = performance.now();
  
  await scope.dispose();
  
  return end - start;
}

async function benchmark() {
  console.log(`Statistical Cached Resolution Benchmark`);
  console.log(`  Iterations per run: ${iterations}`);
  console.log(`  Number of runs: ${runs}`);
  console.log(`  Warmup: 5000 iterations`);
  if (global.gc) {
    console.log(`  GC: Enabled`);
  } else {
    console.log(`  GC: Disabled (run with --expose-gc for better results)`);
  }
  console.log('');
  
  const times = [];
  for (let i = 0; i < runs; i++) {
    const time = await singleRun();
    times.push(time);
    process.stdout.write(`  Run ${i + 1}/${runs}: ${time.toFixed(2)}ms\r`);
  }
  console.log('');
  
  const meanTime = mean(times);
  const medianTime = median(times);
  const stddevTime = stddev(times);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  const meanOpsPerSec = (iterations / (meanTime / 1000)).toFixed(0);
  const medianOpsPerSec = (iterations / (medianTime / 1000)).toFixed(0);
  
  console.log(`\nResults:`);
  console.log(`  Mean:   ${meanTime.toFixed(2)}ms (${meanOpsPerSec} ops/sec)`);
  console.log(`  Median: ${medianTime.toFixed(2)}ms (${medianOpsPerSec} ops/sec)`);
  console.log(`  Stddev: ${stddevTime.toFixed(2)}ms (${((stddevTime / meanTime) * 100).toFixed(1)}%)`);
  console.log(`  Min:    ${minTime.toFixed(2)}ms`);
  console.log(`  Max:    ${maxTime.toFixed(2)}ms`);
  console.log(`\nPer operation:`);
  console.log(`  Mean:   ${((meanTime / iterations) * 1000).toFixed(2)}μs`);
  console.log(`  Median: ${((medianTime / iterations) * 1000).toFixed(2)}μs`);
}

benchmark().catch(console.error);
