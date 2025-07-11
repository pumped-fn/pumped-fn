import { provide, derive, createScope } from "../src";

// Example: Simple sequential flow using generators
async function simpleFlowExample() {
  // Step 1: Create individual step executors
  const validateInput = provide(function* (input: string) {
    console.log("Validating input...");
    yield "validation started";
    
    if (!input) throw new Error("Input is required");
    if (input.length < 3) throw new Error("Input too short");
    
    yield "validation completed";
    return { validated: true, input };
  });

  const processData = provide(function* (data: { validated: boolean; input: string }) {
    console.log("Processing data...");
    yield "processing started";
    
    const processed = data.input.toUpperCase();
    
    yield "processing completed";
    return { processed };
  });

  const saveResult = provide(async function* (data: { processed: string }) {
    console.log("Saving result...");
    yield "saving started";
    
    // Simulate async save
    await new Promise(resolve => setTimeout(resolve, 100));
    
    yield "saving completed";
    return { saved: true, result: data.processed };
  });

  // Step 2: Create a flow that chains these steps
  const dataFlow = derive(
    [validateInput, processData, saveResult],
    async function* (validate, process, save, input: string) {
      // Sequential execution with automatic event collection
      const validated = yield* validate(input);
      const processed = yield* process(validated);
      const saved = yield* save(processed);
      
      return saved;
    }
  );

  // Step 3: Execute the flow
  const scope = createScope();
  const result = await scope.resolve(dataFlow);
  console.log("Flow result:", result("hello"));
  
  await scope.dispose();
}

// Example: Parallel sub-flows
async function parallelFlowExample() {
  // Helper to run generators in parallel and collect their results
  async function* parallel<T extends readonly AsyncGenerator<any, any>[]>(
    ...generators: T
  ): AsyncGenerator<{ type: "parallel"; index: number; value: any }, { [K in keyof T]: Awaited<ReturnType<T[K]["next"]>>["value"] }> {
    const promises = generators.map(async (gen, index) => {
      const results = [];
      for await (const value of gen) {
        yield { type: "parallel" as const, index, value };
        results.push(value);
      }
      const final = await gen.next();
      return final.value;
    });
    
    const results = await Promise.all(promises);
    return results as any;
  }

  const apiCall1 = provide(async function* () {
    yield "api1: starting";
    await new Promise(r => setTimeout(r, 100));
    yield "api1: completed";
    return { api1: "data1" };
  });

  const apiCall2 = provide(async function* () {
    yield "api2: starting";
    await new Promise(r => setTimeout(r, 150));
    yield "api2: completed";
    return { api2: "data2" };
  });

  const apiCall3 = provide(async function* () {
    yield "api3: starting";
    await new Promise(r => setTimeout(r, 50));
    yield "api3: completed";
    return { api3: "data3" };
  });

  const parallelFlow = derive(
    [apiCall1, apiCall2, apiCall3],
    async function* (api1, api2, api3) {
      console.log("Running APIs in parallel...");
      
      // Run all three in parallel
      const results = yield* parallel(
        api1(),
        api2(),
        api3()
      );
      
      return {
        combined: results,
        timestamp: Date.now()
      };
    }
  );

  const scope = createScope();
  const result = await scope.resolve(parallelFlow);
  console.log("Parallel flow result:", result);
  
  await scope.dispose();
}

// Run examples
console.log("=== Simple Flow Example ===");
await simpleFlowExample();

console.log("\n=== Parallel Flow Example ===");
await parallelFlowExample();