import { createScope, provide, resolves, derive } from "@pumped-fn/core-next";
import { flow } from "../src/flow";

// Example: File Processing Flow
// ============================

// Define step executors
const readFile = (path: string) => provide(async () => {
  console.log(`📖 Reading file: ${path}`);
  await new Promise(resolve => setTimeout(resolve, 100));
  return `Content of ${path}`;
});

const validateContent = (content: string) => provide(async () => {
  console.log(`✅ Validating content: ${content.substring(0, 20)}...`);
  await new Promise(resolve => setTimeout(resolve, 50));
  
  if (content.includes('error')) {
    throw new Error('Invalid content detected');
  }
  
  return { isValid: true, length: content.length };
});

const transformContent = (content: string) => provide(async () => {
  console.log(`🔄 Transforming content...`);
  await new Promise(resolve => setTimeout(resolve, 75));
  return content.toUpperCase() + ' [PROCESSED]';
});

const writeFile = (path: string, content: string) => provide(async () => {
  console.log(`💾 Writing to file: ${path}`);
  await new Promise(resolve => setTimeout(resolve, 100));
  return `Successfully wrote to ${path}`;
});

// Example of an executor that accesses flow context
const contextAwareStep = (message: string) => derive([flow.getContext()], async ([context]: [any]) => {
  if (context) {
    console.log(`📊 Context info: Step ${context.stepIndex}, Flow metadata:`, context.flowContext.metadata);
    return `${message} (step ${context.stepIndex})`;
  }
  return message;
});

// Define the file processing flow
const fileProcessingFlow = flow.create(function* (filePath: string) {
  console.log(`🚀 Starting processing: ${filePath}`);
  
  // Step 1: Read the file
  const content = yield readFile(filePath);
  
  // Step 2: Validate content
  const validation = yield validateContent(content);
  
  // Step 3: Transform content
  const transformed = yield transformContent(content);
  
  // Step 4: Write to output file
  const outputPath = filePath.replace('.txt', '_processed.txt');
  const writeResult = yield writeFile(outputPath, transformed);
  
  console.log(`✅ Processing completed!`);
  
  return {
    inputFile: filePath,
    outputFile: outputPath,
    originalLength: validation.length,
    processedLength: transformed.length,
    writeResult
  };
});

// Helper step generator with proper type inference
const processFileStep = flow.step(function* (filePath: string) {
  const processor = yield fileProcessingFlow;
  const result = yield flow.async(() => processor(filePath));
  return result;
});

// Define a batch processing flow using yield* delegation
const batchProcessingFlow = flow.create(function* (filePaths: string[]) {
  console.log(`📦 Starting batch processing for ${filePaths.length} files`);
  
  const results = [];
  
  for (const filePath of filePaths) {
    console.log(`📄 Processing file ${results.length + 1} of ${filePaths.length}: ${filePath}`);
    
    // Use yield* to delegate to the helper step
    const result = yield* processFileStep(filePath);
    results.push(result);
  }
  
  console.log(`🎉 Batch processing completed! Processed ${results.length} files`);
  
  return {
    totalFiles: filePaths.length,
    processed: results.length,
    results
  };
});

// Usage Examples
async function runExamples() {
  const scope = createScope();
  
  console.log('=== Single File Processing ===');
  
  try {
    const processor = await resolves(scope, { flow: fileProcessingFlow });
    const result = await processor.flow('document.txt');
    console.log('📊 Result:', result);
  } catch (error) {
    console.log('❌ Error:', (error as Error).message);
  }
  
  console.log('\n=== Batch Processing ===');
  
  try {
    const batchProcessor = await resolves(scope, { flow: batchProcessingFlow });
    const result = await batchProcessor.flow(['file1.txt', 'file2.txt', 'file3.txt']);
    console.log('📊 Batch Result:', result);
  } catch (error) {
    console.log('❌ Batch Error:', (error as Error).message);
  }
  
  console.log('\n=== Recovery Example ===');
  
  try {
    const processor = await resolves(scope, { flow: fileProcessingFlow });
    
    // Create a context to simulate recovery from step 2
    const context = flow.context.create();
    context.stepIndex = 2;
    context.stepResults = [
      'Content of recovery_file.txt',
      { isValid: true, length: 100 }
    ];
    
    console.log('🔄 Resuming from step 2...');
    const result = await processor.flow('recovery_file.txt', context);
    console.log('📊 Recovered Result:', result);
  } catch (error) {
    console.log('❌ Recovery Error:', (error as Error).message);
  }
}

// Uncomment to run examples
// runExamples();

export { 
  fileProcessingFlow, 
  batchProcessingFlow, 
  runExamples 
};