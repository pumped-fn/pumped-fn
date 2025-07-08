import { provide, derive, createScope } from '@pumped-fn/core-next';
import { z } from 'zod';
import { 
  FlowScope, 
  step, 
  flow, 
  execute, 
  runStep
} from '../src/flow';

// ================================
// Simple Working Example
// ================================

// App dependencies
const configExecutor = provide(() => ({
  multiplier: 3,
  greeting: 'Hello'
}));

const loggerExecutor = provide(() => ({
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`)
}));

// Simple step with new signature
const processNumberStep = step(
  z.object({ value: z.number() }),
  z.object({ result: z.number() }),
  derive(
    { config: configExecutor, logger: loggerExecutor },
    ({ config, logger }) => {
      return async function*(input: { value: number }) {
        logger.info(`Processing number: ${input.value}`);
        yield { type: 'step.start', step: 'processNumber' };
        
        const result = input.value * config.multiplier;
        
        yield { type: 'step.complete', step: 'processNumber', data: result };
        return { result };
      };
    }
  )
);

// Simple flow with new signature
const numberFlow = flow(
  z.object({ value: z.number() }),
  z.object({ 
    originalValue: z.number(),
    processedValue: z.number(),
    flowId: z.string()
  }),
  derive(
    { processStep: processNumberStep, logger: loggerExecutor },
    ({ processStep, logger }) => {
      return async function*(input) {
        const flowId = `flow-${Date.now()}`;
        
        logger.info(`Starting flow ${flowId}`);
        yield { type: 'flow.start', flowId };
        
        // Process the number using direct yield* syntax
        const processed = yield* processStep(input);
        
        yield { type: 'flow.complete', flowId };
        logger.info(`Flow ${flowId} completed`);
        
        return {
          originalValue: input.value,
          processedValue: processed.result,
          flowId
        };
      };
    }
  )
);

// Usage example
async function main() {
  console.log('🚀 Starting Simple Flow Example\n');
  
  // Set up app scope
  const appScope = createScope();
  await appScope.resolve(configExecutor);
  await appScope.resolve(loggerExecutor);
  
  // Execute flow with new execute function
  try {
    const result = await execute(numberFlow, { value: 7 }, {
      parentScope: appScope,
      onEvent: (event) => console.log('📡 Event:', event.type),
      onComplete: (result) => console.log('🎯 Completed with result:', result)
    });
    
    console.log('\n📊 Results:');
    console.log('Events:', result.events.length);
    console.log('Original:', result.result.originalValue);
    console.log('Processed:', result.result.processedValue);
    console.log('Flow ID:', result.result.flowId);
    
  } catch (error) {
    console.error('💥 Flow failed:', error);
  }
  
  await appScope.dispose();
  console.log('✅ Example complete');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { numberFlow, processNumberStep };