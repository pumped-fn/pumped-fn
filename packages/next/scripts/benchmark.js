#!/usr/bin/env node

/**
 * Performance benchmark runner for @pumped-fn/core-next
 * 
 * This script runs performance tests with detailed memory and timing analysis.
 * It's designed to be run in Node.js environments where process.memoryUsage() 
 * and optional global.gc() are available.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function formatMemory(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

function logSection(title) {
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize(title, 'bright'));
  console.log(colorize('='.repeat(60), 'cyan'));
}

function logSubSection(title) {
  console.log('\n' + colorize('-'.repeat(40), 'yellow'));
  console.log(colorize(title, 'yellow'));
  console.log(colorize('-'.repeat(40), 'yellow'));
}

async function runBenchmark() {
  logSection('🚀 PUMPED-FN CORE-NEXT PERFORMANCE BENCHMARK');
  
  const startTime = Date.now();
  const initialMemory = process.memoryUsage();
  
  console.log(colorize('📊 Initial Memory Usage:', 'blue'));
  console.log(`  Heap Used: ${formatMemory(initialMemory.heapUsed)}`);
  console.log(`  Heap Total: ${formatMemory(initialMemory.heapTotal)}`);
  console.log(`  RSS: ${formatMemory(initialMemory.rss)}`);
  console.log(`  External: ${formatMemory(initialMemory.external)}`);
  
  // Check if GC is available
  const gcAvailable = typeof global !== 'undefined' && typeof global.gc === 'function';
  console.log(colorize(`🗑️  Garbage Collection: ${gcAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`, 
    gcAvailable ? 'green' : 'yellow'));
  
  if (!gcAvailable) {
    console.log(colorize('   💡 Tip: Run with --expose-gc flag for better memory analysis', 'yellow'));
  }
  
  logSubSection('🏃‍♂️ Running Performance Tests');
  
  // Run the performance tests
  const testProcess = spawn('npx', ['vitest', 'run', 'tests/performance.test.ts', '--reporter=verbose'], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });
  
  return new Promise((resolve, reject) => {
    testProcess.on('close', (code) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const finalMemory = process.memoryUsage();
      
      logSection('📈 BENCHMARK RESULTS');
      
      console.log(colorize('⏱️  Total Execution Time:', 'green'));
      console.log(`  ${(duration / 1000).toFixed(2)} seconds`);
      
      console.log(colorize('🧠 Memory Usage Comparison:', 'blue'));
      console.log(`  Initial Heap: ${formatMemory(initialMemory.heapUsed)}`);
      console.log(`  Final Heap: ${formatMemory(finalMemory.heapUsed)}`);
      console.log(`  Heap Growth: ${formatMemory(finalMemory.heapUsed - initialMemory.heapUsed)}`);
      console.log(`  RSS Growth: ${formatMemory(finalMemory.rss - initialMemory.rss)}`);
      
      const heapGrowthMB = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      if (heapGrowthMB > 100) {
        console.log(colorize('⚠️  WARNING: Significant memory growth detected!', 'red'));
      } else if (heapGrowthMB > 50) {
        console.log(colorize('⚠️  CAUTION: Moderate memory growth detected', 'yellow'));
      } else {
        console.log(colorize('✅ Memory growth within acceptable limits', 'green'));
      }
      
      console.log(colorize('🎯 Performance Test Status:', 'magenta'));
      if (code === 0) {
        console.log(colorize('  ✅ All performance tests passed!', 'green'));
      } else {
        console.log(colorize('  ❌ Some performance tests failed', 'red'));
      }
      
      logSection('🔍 RECOMMENDATIONS');
      
      if (heapGrowthMB > 50) {
        console.log(colorize('• Consider implementing memory optimizations', 'yellow'));
        console.log(colorize('• Review scope cleanup and disposal logic', 'yellow'));
        console.log(colorize('• Monitor for memory leaks in production', 'yellow'));
      }
      
      if (!gcAvailable) {
        console.log(colorize('• Enable GC exposure for better memory analysis', 'yellow'));
        console.log(colorize('  Run: node --expose-gc scripts/benchmark.js', 'yellow'));
      }
      
      console.log(colorize('• Profile with Node.js built-in profiler for detailed analysis', 'cyan'));
      console.log(colorize('• Consider using clinic.js for production profiling', 'cyan'));
      
      logSection('🏁 BENCHMARK COMPLETE');
      
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Performance tests failed with code ${code}`));
      }
    });
    
    testProcess.on('error', (error) => {
      console.error(colorize('❌ Failed to run benchmark:', 'red'), error);
      reject(error);
    });
  });
}

// Handle command line arguments
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');

if (helpFlag) {
  console.log(`
${colorize('Pumped-FN Core-Next Performance Benchmark', 'bright')}

Usage: node scripts/benchmark.js [options]

Options:
  --help, -h     Show this help message
  
Environment:
  Set NODE_OPTIONS="--expose-gc" to enable garbage collection control
  
Examples:
  node scripts/benchmark.js
  NODE_OPTIONS="--expose-gc" node scripts/benchmark.js
  
This benchmark tests:
  • Memory leak detection in scopes
  • Object creation overhead
  • Dependency resolution performance
  • Middleware and cleanup efficiency
  • Reactive chain performance
  • Memory pressure handling
`);
  process.exit(0);
}

// Run the benchmark
runBenchmark().catch((error) => {
  console.error(colorize('❌ Benchmark failed:', 'red'), error);
  process.exit(1);
});