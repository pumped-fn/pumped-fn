import { StandardSchemaV1, Core, createScope, isExecutor, provide, derive, meta, custom } from "@pumped-fn/core-next"

export declare namespace Flow {

  export type Success<T> = { kind: "success", value: T }
  export type Error = { kind: "error", error: unknown }

  export type Result<T> = Success<T> | Error

  export type AsyncUnit<Input, Output> = (input: Input, context: FlowController) => Promise<Output>

  export type FlowUnit<Input, Output> = {
    execution: AsyncUnit<Input, Output>
    inputSchema: StandardSchemaV1<Input>
    name?: string
    description?: string
  }

  export type Flow<Input, Output> = Core.Executor<FlowUnit<Input, Output>>

  export type RetryOptions = {
    maxAttempts?: number
    initialDelay?: number
    maxDelay?: number
    backoffMultiplier?: number
    shouldRetry?: (error: unknown, attempt: number) => boolean
  }

  export type ExecutionOption = {
    timeout?: number
    retry?: RetryOptions | number
    rateLimit?: {
      maxConcurrent?: number
      maxPerSecond?: number
    }
    name?: string
  }

  export type ExecutionMetrics = {
    flowName?: string
    startTime: number
    endTime?: number
    duration?: number
    status: 'pending' | 'success' | 'error' | 'timeout' | 'cancelled'
    error?: unknown
    attempts?: number
    retryDelays?: number[]
    inputSize?: number
    outputSize?: number
    timeout?: number
  }

  export type FlowExecutionRecord = {
    id: string
    flowName?: string
    parentId?: string
    metrics: ExecutionMetrics
    children: FlowExecutionRecord[]
  }

  export type ExecutionContext = {
    rootExecution?: FlowExecutionRecord
    currentExecution?: FlowExecutionRecord
    executionStack: FlowExecutionRecord[]
    customData: Record<string, any>
  }

  export type FlowController = {
    scope: Core.Scope
    execute: <Input, Output>(flow: FlowUnit<Input, Output>, input: Input, option?: ExecutionOption) => Promise<Output>
    safeExecute: <Input, Output>(flow: FlowUnit<Input, Output>, input: Input, option?: ExecutionOption) => Promise<Result<Output>>
    executeWithTimeout: <Input, Output>(flow: FlowUnit<Input, Output>, input: Input, timeoutMs: number, option?: ExecutionOption) => Promise<Output>
    executeWithRetry: <Input, Output>(flow: FlowUnit<Input, Output>, input: Input, retryOptions: RetryOptions, option?: ExecutionOption) => Promise<Output>
    executeMany: <Input, Output>(flow: FlowUnit<Input, Output>, inputs: Input[], option?: ExecutionOption & { concurrency?: number }) => Promise<Output[]>
    executeBatch: <Input, Output>(flow: FlowUnit<Input[], Output>, inputs: Input[], batchSize: number, option?: ExecutionOption) => Promise<Output[]>
    context: ExecutionContext
    getMetrics: () => FlowExecutionRecord | undefined
  }

  export type FlowResult<Output> = {
    context: ExecutionContext
    result: Result<Output>
  }

}

const success = <T>(value: T): Flow.Success<T> => ({ kind: "success", value })
const error = (error: unknown): Flow.Error => ({ kind: "error", error })

const flowMeta = meta('pumped-fn/flow', custom<{
  inputSchema: StandardSchemaV1<any>,
  outputSchema: StandardSchemaV1<any>,
  name?: string,
  description?: string
}>())

function createFlow<I, O>(
  setting: {
    name?: string, 
    inputSchema: StandardSchemaV1<I>,
    outputSchema: StandardSchemaV1<O>,
    description?: string
  },
  flow: Core.Executor<
    | Flow.AsyncUnit<I, O>> 
    | Flow.AsyncUnit<I, O>
): Flow.Flow<I, O> {
  const executor = isExecutor(flow) ? flow : provide(() => flow)

  return derive(
    executor,
    (execution) => ({
      execution,
      ...setting
    }),
    flowMeta(setting)
  )
}

let executionCounter = 0

function generateExecutionId(): string {
  return `flow-${Date.now()}-${++executionCounter}`
}

function estimateSize(obj: any): number {
  try {
    return JSON.stringify(obj).length
  } catch {
    return -1
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function calculateBackoffDelay(attempt: number, options: Flow.RetryOptions): number {
  const initialDelay = options.initialDelay ?? 100
  const maxDelay = options.maxDelay ?? 30000
  const multiplier = options.backoffMultiplier ?? 2
  
  const delay = Math.min(initialDelay * Math.pow(multiplier, attempt - 1), maxDelay)
  // Add jitter to prevent thundering herd
  return delay + Math.random() * delay * 0.1
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

// Simple rate limiter
class RateLimiter {
  private queue: Array<() => void> = []
  private activeCount = 0
  private lastSecond = 0
  private countInSecond = 0
  
  constructor(
    private maxConcurrent: number = Infinity,
    private maxPerSecond: number = Infinity
  ) {}
  
  async acquire(): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    if (now !== this.lastSecond) {
      this.lastSecond = now
      this.countInSecond = 0
    }
    
    while (
      this.activeCount >= this.maxConcurrent || 
      this.countInSecond >= this.maxPerSecond
    ) {
      await new Promise<void>(resolve => this.queue.push(resolve))
      
      // Recheck time for per-second limit
      const currentSecond = Math.floor(Date.now() / 1000)
      if (currentSecond !== this.lastSecond) {
        this.lastSecond = currentSecond
        this.countInSecond = 0
      }
    }
    
    this.activeCount++
    this.countInSecond++
  }
  
  release(): void {
    this.activeCount--
    const next = this.queue.shift()
    if (next) next()
  }
}

async function execute<Input, Output>(
  flow: Flow.Flow<Input, Output>,
  input: Input,
  scope?: Core.Scope
): Promise<Flow.FlowResult<Output>> {
  const executionScope = scope || createScope()
  const executionContext: Flow.ExecutionContext = {
    executionStack: [],
    customData: {}
  }

  // Shared rate limiter for this execution context
  const rateLimiter = new RateLimiter()

  const controller: Flow.FlowController = {
    scope: executionScope,
    context: executionContext,
    getMetrics: () => executionContext.rootExecution,
    safeExecute: async function <SubInput, SubOutput>(
      subFlow: Flow.FlowUnit<SubInput, SubOutput>,
      subInput: SubInput,
      option?: Flow.ExecutionOption
    ): Promise<Flow.Result<SubOutput>> {
      const executionId = generateExecutionId()
      const flowName = subFlow.name || option?.name || 'anonymous'
      
      // Parse retry options
      const retryOptions: Flow.RetryOptions = typeof option?.retry === 'number' 
        ? { maxAttempts: option.retry }
        : option?.retry || {}
      const maxAttempts = retryOptions.maxAttempts ?? 1
      const shouldRetry = retryOptions.shouldRetry ?? (() => true)
      
      // Create execution record
      const executionRecord: Flow.FlowExecutionRecord = {
        id: executionId,
        flowName,
        parentId: executionContext.currentExecution?.id,
        metrics: {
          flowName,
          startTime: Date.now(),
          status: 'pending',
          inputSize: estimateSize(subInput),
          timeout: option?.timeout,
          attempts: 0,
          retryDelays: []
        },
        children: []
      }

      // Add to parent's children if exists
      if (executionContext.currentExecution) {
        executionContext.currentExecution.children.push(executionRecord)
      }

      // Set as root if first execution
      if (!executionContext.rootExecution) {
        executionContext.rootExecution = executionRecord
      }

      // Push to stack and set as current
      executionContext.executionStack.push(executionRecord)
      const previousExecution = executionContext.currentExecution
      executionContext.currentExecution = executionRecord

      let lastError: unknown
      
      try {
        // Retry loop
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          executionRecord.metrics.attempts = attempt
          
          try {
            // Apply rate limiting if configured
            if (option?.rateLimit) {
              const limiter = new RateLimiter(
                option.rateLimit.maxConcurrent,
                option.rateLimit.maxPerSecond
              )
              await limiter.acquire()
              try {
                const result = await executeWithPossibleTimeout()
                limiter.release()
                return success(result)
              } finally {
                limiter.release()
              }
            } else {
              const result = await executeWithPossibleTimeout()
              return success(result)
            }
          } catch (err) {
            lastError = err
            
            // Don't retry on timeout or if shouldn't retry
            if (err instanceof TimeoutError || !shouldRetry(err, attempt)) {
              break
            }
            
            // Don't retry if this was the last attempt
            if (attempt < maxAttempts) {
              const delay = calculateBackoffDelay(attempt, retryOptions)
              executionRecord.metrics.retryDelays?.push(delay)
              await sleep(delay)
            }
          }
        }
        
        // All attempts failed
        throw lastError
        
      } catch (err) {
        // Update metrics on error
        executionRecord.metrics.endTime = Date.now()
        executionRecord.metrics.duration = executionRecord.metrics.endTime - executionRecord.metrics.startTime
        executionRecord.metrics.status = err instanceof TimeoutError ? 'timeout' : 'error'
        executionRecord.metrics.error = err
        
        return error(err)
      } finally {
        // Pop from stack and restore previous execution
        executionContext.executionStack.pop()
        executionContext.currentExecution = previousExecution
      }
      
      async function executeWithPossibleTimeout(): Promise<SubOutput> {
        if (option?.timeout) {
          return Promise.race([
            subFlow.execution(subInput, controller),
            sleep(option.timeout).then(() => {
              throw new TimeoutError(`Flow execution timed out after ${option.timeout}ms`)
            })
          ])
        }
        
        const result = await subFlow.execution(subInput, controller)
        
        // Update metrics on success
        executionRecord.metrics.endTime = Date.now()
        executionRecord.metrics.duration = executionRecord.metrics.endTime - executionRecord.metrics.startTime
        executionRecord.metrics.status = 'success'
        executionRecord.metrics.outputSize = estimateSize(result)
        
        return result
      }
    },
    execute: async function <SubInput, SubOutput>(
      subFlow: Flow.FlowUnit<SubInput, SubOutput>,
      subInput: SubInput,
      option?: Flow.ExecutionOption
    ): Promise<SubOutput> {
      const result = await this.safeExecute(subFlow, subInput, option)
      if (result.kind === "error") {
        throw result.error
      }
      return result.value
    },
    
    executeWithTimeout: async function <SubInput, SubOutput>(
      subFlow: Flow.FlowUnit<SubInput, SubOutput>,
      subInput: SubInput,
      timeoutMs: number,
      option?: Flow.ExecutionOption
    ): Promise<SubOutput> {
      return this.execute(subFlow, subInput, { ...option, timeout: timeoutMs })
    },
    
    executeWithRetry: async function <SubInput, SubOutput>(
      subFlow: Flow.FlowUnit<SubInput, SubOutput>,
      subInput: SubInput,
      retryOptions: Flow.RetryOptions,
      option?: Flow.ExecutionOption
    ): Promise<SubOutput> {
      return this.execute(subFlow, subInput, { ...option, retry: retryOptions })
    },
    
    executeMany: async function <SubInput, SubOutput>(
      subFlow: Flow.FlowUnit<SubInput, SubOutput>,
      inputs: SubInput[],
      option?: Flow.ExecutionOption & { concurrency?: number }
    ): Promise<SubOutput[]> {
      const concurrency = option?.concurrency ?? inputs.length
      const results: SubOutput[] = []
      const errors: Array<{ index: number, error: unknown }> = []
      
      // Process in batches
      for (let i = 0; i < inputs.length; i += concurrency) {
        const batch = inputs.slice(i, i + concurrency)
        const batchPromises = batch.map(async (input, batchIndex) => {
          const index = i + batchIndex
          try {
            const result = await this.execute(subFlow, input, option)
            results[index] = result
          } catch (error) {
            errors.push({ index, error })
            throw error
          }
        })
        
        try {
          await Promise.all(batchPromises)
        } catch {
          // Continue processing remaining batches
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`Failed to execute ${errors.length} of ${inputs.length} flows`)
      }
      
      return results
    },
    
    executeBatch: async function <SubInput, SubOutput>(
      subFlow: Flow.FlowUnit<SubInput[], SubOutput>,
      inputs: SubInput[],
      batchSize: number,
      option?: Flow.ExecutionOption
    ): Promise<SubOutput[]> {
      const results: SubOutput[] = []
      
      for (let i = 0; i < inputs.length; i += batchSize) {
        const batch = inputs.slice(i, i + batchSize)
        const result = await this.execute(subFlow, batch, option)
        results.push(result)
      }
      
      return results
    }
  }

  return await executionScope.resolve(flow)
    .then(async resolvedFlow => {
      const result = await controller.safeExecute(resolvedFlow, input)
      return {
        context: executionContext,
        result: result
      }
    })
    .catch(e => {
      return {
        context: executionContext,
        result: error(e)
      }
    })
}

export const flow = {
  create: createFlow,
  execute: execute,
}