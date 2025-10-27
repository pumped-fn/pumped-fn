import { tag, custom } from "../dist/index.js";
import { performance } from "perf_hooks";

const iterations = 100000;

// Create tag instances
const tag1 = tag(custom(), { label: "tag1" });
const tag2 = tag(custom(), { label: "tag2" });
const tag3 = tag(custom(), { label: "tag3" });
const tag4 = tag(custom(), { label: "tag4" });
const tag5 = tag(custom(), { label: "tag5" });
const tag6 = tag(custom(), { label: "tag6" });
const tag7 = tag(custom(), { label: "tag7" });

const benchmarks = {
  "Tag lookup - small array (3 tags, first match)": () => {
    const tags = [tag1("a"), tag2("b"), tag3("c")];
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      tag1.find(tags);
    }
    const end = performance.now();
    
    return end - start;
  },

  "Tag lookup - small array (3 tags, last match)": () => {
    const tags = [tag1("a"), tag2("b"), tag3("c")];
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      tag3.find(tags);
    }
    const end = performance.now();
    
    return end - start;
  },

  "Tag lookup - medium array (7 tags, middle match)": () => {
    const tags = [
      tag1("a"), tag2("b"), tag3("c"), tag4("d"),
      tag5("e"), tag6("f"), tag7("g")
    ];
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      tag4.find(tags);
    }
    const end = performance.now();
    
    return end - start;
  },

  "Tag lookup - medium array (7 tags, last match)": () => {
    const tags = [
      tag1("a"), tag2("b"), tag3("c"), tag4("d"),
      tag5("e"), tag6("f"), tag7("g")
    ];
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      tag7.find(tags);
    }
    const end = performance.now();
    
    return end - start;
  },

  "Tag lookup - repeated on same source (cache hit)": () => {
    const tags = [
      tag1("a"), tag2("b"), tag3("c"), tag4("d"),
      tag5("e"), tag6("f"), tag7("g")
    ];
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      tag1.find(tags);
      tag4.find(tags);
      tag7.find(tags);
    }
    const end = performance.now();
    
    return end - start;
  },

  "Tag collect - multiple values": () => {
    const tags = [
      tag1("a"), tag1("b"), tag1("c"),
      tag2("d"), tag2("e")
    ];
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      tag1.some(tags);
    }
    const end = performance.now();
    
    return end - start;
  },
};

console.log("Running tag lookup benchmarks...\n");

for (const [name, benchmark] of Object.entries(benchmarks)) {
  const time = benchmark();
  const avgTime = (time / iterations) * 1000; // Convert to microseconds
  const opsPerSec = (iterations / time) * 1000;
  
  console.log(`${name}:`);
  console.log(`  Total: ${time.toFixed(2)}ms`);
  console.log(`  Avg: ${avgTime.toFixed(4)}μs/op`);
  console.log(`  Ops/sec: ${opsPerSec.toFixed(0)}`);
  console.log();
}
