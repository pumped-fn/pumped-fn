import { vi, describe, it, expect } from 'vitest';
import { flow } from "../src/flow"
import { provide, derive, createScope, custom } from "@pumped-fn/core-next"
import type { Flow } from "../src/flow"

describe("flow module", () => {
  
  describe("Basic Flow Operations", () => {
    it("should execute flows with dependency injection", async () => {
      // Define types
      type User = { id: string, name: string, email: string }
      type ApiResponse<T> = { data: T, timestamp: number }

      // Mock API service
      const apiService = provide(() => ({
        async getUser(id: string): Promise<ApiResponse<User>> {
          await new Promise(resolve => setTimeout(resolve, 50))
          return {
            data: { id, name: `User ${id}`, email: `${id}@example.com` },
            timestamp: Date.now()
          }
        }
      }))

      // Flow 1: Fetch user data
      const getUserFlow = flow.create(
        {
          name: "getUser",
          inputSchema: custom<string>(),
          outputSchema: custom<User>()
        },
        derive(
          apiService,
          (api) => async (userId, controller) => {
            controller.context.customData.fetchStarted = Date.now()
            const response = await api.getUser(userId)
            controller.context.customData.fetchCompleted = Date.now()
            return response.data
          }
        )
      )

      // Flow 2: Transform user data
      const enrichUserFlow = flow.create(
        {
          name: "enrichUser",
          inputSchema: custom<User>(),
          outputSchema: custom<{ user: User, enrichedAt: string, status: 'active' | 'inactive' }>()
        },
        provide(() => async (user) => {
          return {
            user,
            enrichedAt: new Date().toISOString(),
            status: 'active' as const
          }
        })
      )

      // Flow 3: Orchestrate multiple operations
      const processUsersFlow = flow.create(
        {
          name: "processUsers",
          inputSchema: custom<string[]>(),
          outputSchema: custom<{ processed: User[], count: number }>()
        },
        derive(
          [getUserFlow, enrichUserFlow],
          ([getUser, enrichUser]) => async (userIds, controller) => {
            const processed: User[] = []
            
            for (const id of userIds) {
              const user = await controller.execute(getUser, id)
              const enriched = await controller.execute(enrichUser, user)
              processed.push(enriched.user)
            }
            
            return { processed, count: processed.length }
          }
        )
      )

      // Execute flows
      const scope = createScope()
      
      // Test single user fetch
      const singleResult = await flow.execute(getUserFlow, "user-1", scope)
      expect(singleResult.result.kind).toBe("success")
      if (singleResult.result.kind === "success") {
        expect(singleResult.result.value.id).toBe("user-1")
        expect(singleResult.result.value.name).toBe("User user-1")
      }
      
      // Test orchestrated flow
      const multiResult = await flow.execute(processUsersFlow, ["user-1", "user-2", "user-3"], scope)
      expect(multiResult.result.kind).toBe("success")
      if (multiResult.result.kind === "success") {
        expect(multiResult.result.value.count).toBe(3)
        expect(multiResult.result.value.processed).toHaveLength(3)
      }
      
      // Verify context data
      expect(singleResult.context.customData.fetchStarted).toBeDefined()
      expect(singleResult.context.customData.fetchCompleted).toBeDefined()
    })
  })

  describe("Error Handling", () => {
    it("should handle errors gracefully", async () => {
      type ValidationResult = { valid: boolean, message: string }
      
      // Flow that can fail
      const validateEmailFlow = flow.create(
        {
          name: "validateEmail",
          inputSchema: custom<string>(),
          outputSchema: custom<ValidationResult>()
        },
        provide(() => async (email) => {
          if (!email.includes('@')) {
            throw new Error('Invalid email format')
          }
          return { valid: true, message: 'Email is valid' }
        })
      )

      // Flow that handles errors
      const safeValidateFlow = flow.create(
        {
          name: "safeValidate",
          inputSchema: custom<string[]>(),
          outputSchema: custom<{ results: Array<{ email: string, result: ValidationResult | null, error?: string }> }>()
        },
        derive(
          validateEmailFlow,
          (validate) => async (emails, controller) => {
            const results = []
            
            for (const email of emails) {
              const result = await controller.safeExecute(validate, email)
              results.push({
                email,
                result: result.kind === 'success' ? result.value : null,
                error: result.kind === 'error' ? String(result.error) : undefined
              })
            }
            
            return { results }
          }
        )
      )

      const scope = createScope()
      
      // Test error handling
      const errorResult = await flow.execute(validateEmailFlow, "invalid-email", scope)
      expect(errorResult.result.kind).toBe("error")
      
      // Test safe execution
      const safeResult = await flow.execute(
        safeValidateFlow, 
        ["valid@example.com", "invalid", "test@test.com"],
        scope
      )
      
      expect(safeResult.result.kind).toBe("success")
      if (safeResult.result.kind === "success") {
        const { results } = safeResult.result.value
        expect(results[0].result?.valid).toBe(true)
        expect(results[1].error).toContain("Invalid email")
        expect(results[2].result?.valid).toBe(true)
      }
    })
  })

  describe("Flow Metrics Collection", () => {
    it("should collect comprehensive execution metrics", async () => {
      type Task = { id: string, name: string, duration: number }
      type TaskResult = { task: Task, completedAt: number, success: boolean }
      
      // Simple flow that simulates work
      const executeTaskFlow = flow.create(
        {
          name: "executeTask",
          inputSchema: custom<Task>(),
          outputSchema: custom<TaskResult>()
        },
        provide(() => async (task) => {
          await new Promise(resolve => setTimeout(resolve, task.duration))
          return {
            task,
            completedAt: Date.now(),
            success: true
          }
        })
      )

      // Flow that orchestrates multiple tasks
      const processTasksFlow = flow.create(
        {
          name: "processTasks",
          inputSchema: custom<Task[]>(),
          outputSchema: custom<{ results: TaskResult[], totalDuration: number }>()
        },
        derive(
          executeTaskFlow,
          (executeTask) => async (tasks, controller) => {
            const startTime = Date.now()
            const results: TaskResult[] = []
            
            for (const task of tasks) {
              const result = await controller.execute(executeTask, task)
              results.push(result)
            }
            
            return { 
              results, 
              totalDuration: Date.now() - startTime 
            }
          }
        )
      )

      const scope = createScope()
      
      // Test single task execution
      const task: Task = { id: "1", name: "Quick task", duration: 50 }
      const singleResult = await flow.execute(executeTaskFlow, task, scope)
      
      expect(singleResult.result.kind).toBe("success")
      
      // Check metrics
      const metrics = singleResult.context.rootExecution
      expect(metrics).toBeDefined()
      expect(metrics?.flowName).toBe("executeTask")
      expect(metrics?.metrics.status).toBe("success")
      expect(metrics?.metrics.duration).toBeGreaterThanOrEqual(50)
      expect(metrics?.metrics.inputSize).toBeGreaterThan(0)
      
      // Test nested execution
      const tasks: Task[] = [
        { id: "1", name: "Task 1", duration: 10 },
        { id: "2", name: "Task 2", duration: 20 },
        { id: "3", name: "Task 3", duration: 30 }
      ]
      
      const multiResult = await flow.execute(processTasksFlow, tasks, scope)
      expect(multiResult.result.kind).toBe("success")
      
      // Check nested metrics
      const nestedMetrics = multiResult.context.rootExecution
      expect(nestedMetrics?.flowName).toBe("processTasks")
      expect(nestedMetrics?.children).toHaveLength(3)
      
      // Verify child execution metrics
      nestedMetrics?.children.forEach((child, index) => {
        expect(child.flowName).toBe("executeTask")
        expect(child.metrics.status).toBe("success")
        expect(child.metrics.duration).toBeGreaterThanOrEqual(tasks[index].duration)
      })
    })
  })

  describe("Advanced Execution Operations", () => {
    it("should handle timeout operations", async () => {
      type DelayedResult = { message: string, duration: number }
      
      // Flow that takes variable time
      const delayedFlow = flow.create(
        {
          name: "delayedFlow",
          inputSchema: custom<number>(),
          outputSchema: custom<DelayedResult>()
        },
        provide(() => async (delayMs) => {
          const start = Date.now()
          await new Promise(resolve => setTimeout(resolve, delayMs))
          return { 
            message: `Completed after ${delayMs}ms`,
            duration: Date.now() - start
          }
        })
      )

      const scope = createScope()
      
      // Test successful execution within timeout
      const successResult = await flow.execute(delayedFlow, 50, scope)
      expect(successResult.result.kind).toBe("success")
      
      // Test timeout
      const timeoutFlow = flow.create(
        {
          name: "timeoutTest",
          inputSchema: custom<number>(),
          outputSchema: custom<DelayedResult>()
        },
        derive(
          delayedFlow,
          (delayed) => async (delay, controller) => {
            return controller.executeWithTimeout(delayed, delay, 100)
          }
        )
      )
      
      // Should succeed with 50ms delay and 100ms timeout
      const withinTimeout = await flow.execute(timeoutFlow, 50, scope)
      expect(withinTimeout.result.kind).toBe("success")
      
      // Should timeout with 200ms delay and 100ms timeout
      const beyondTimeout = await flow.execute(timeoutFlow, 200, scope)
      expect(beyondTimeout.result.kind).toBe("error")
      
      // Check metrics for timeout
      const timeoutMetrics = beyondTimeout.context.rootExecution
      expect(timeoutMetrics?.children[0].metrics.status).toBe("timeout")
    })

    it("should handle retry with exponential backoff", async () => {
      let attemptCount = 0
      const errors: number[] = []
      
      // Flow that fails first N times
      const unreliableFlow = flow.create(
        {
          name: "unreliableFlow",
          inputSchema: custom<{ failTimes: number }>(),
          outputSchema: custom<{ attempt: number, message: string }>()
        },
        provide(() => async ({ failTimes }) => {
          attemptCount++
          if (attemptCount <= failTimes) {
            errors.push(attemptCount)
            throw new Error(`Attempt ${attemptCount} failed`)
          }
          return { attempt: attemptCount, message: "Success!" }
        })
      )

      const scope = createScope()
      
      // Test retry with backoff
      const retryFlow = flow.create(
        {
          name: "retryTest",
          inputSchema: custom<{ failTimes: number }>(),
          outputSchema: custom<{ attempt: number, message: string }>()
        },
        derive(
          unreliableFlow,
          (unreliable) => async (input, controller) => {
            attemptCount = 0 // Reset for test
            return controller.executeWithRetry(unreliable, input, {
              maxAttempts: 5,
              initialDelay: 10,
              maxDelay: 100,
              backoffMultiplier: 2
            })
          }
        )
      )
      
      // Should succeed after 3 failures
      const result = await flow.execute(retryFlow, { failTimes: 3 }, scope)
      expect(result.result.kind).toBe("success")
      if (result.result.kind === "success") {
        expect(result.result.value.attempt).toBe(4)
      }
      
      // Check retry metrics
      const metrics = result.context.rootExecution?.children[0].metrics
      expect(metrics?.attempts).toBe(4)
      expect(metrics?.retryDelays).toHaveLength(3)
      // Verify exponential backoff
      expect(metrics?.retryDelays?.[0]).toBeGreaterThanOrEqual(10)
      expect(metrics?.retryDelays?.[1]).toBeGreaterThanOrEqual(20)
      expect(metrics?.retryDelays?.[2]).toBeGreaterThanOrEqual(40)
    })

    it("should handle parallel execution with concurrency control", async () => {
      const executionTimes: number[] = []
      
      // Flow that records when it executes
      const recordingFlow = flow.create(
        {
          name: "recordingFlow",
          inputSchema: custom<{ id: number, delay: number }>(),
          outputSchema: custom<{ id: number, executedAt: number }>()
        },
        provide(() => async ({ id, delay }) => {
          const executedAt = Date.now()
          executionTimes.push(executedAt)
          await new Promise(resolve => setTimeout(resolve, delay))
          return { id, executedAt }
        })
      )

      const scope = createScope()
      
      // Test parallel execution with concurrency limit
      const parallelFlow = flow.create(
        {
          name: "parallelTest",
          inputSchema: custom<Array<{ id: number, delay: number }>>(),
          outputSchema: custom<Array<{ id: number, executedAt: number }>>()
        },
        derive(
          recordingFlow,
          (recording) => async (inputs, controller) => {
            executionTimes.length = 0 // Reset
            return controller.executeMany(recording, inputs, { concurrency: 2 })
          }
        )
      )
      
      const inputs = [
        { id: 1, delay: 50 },
        { id: 2, delay: 50 },
        { id: 3, delay: 50 },
        { id: 4, delay: 50 }
      ]
      
      const result = await flow.execute(parallelFlow, inputs, scope)
      expect(result.result.kind).toBe("success")
      
      // With concurrency 2, should have 2 batches
      // First two should start immediately, next two after ~50ms
      const timeDiffs = executionTimes.slice(1).map((t, i) => t - executionTimes[i])
      expect(timeDiffs[0]).toBeLessThan(10) // First two start together
      expect(timeDiffs[1]).toBeGreaterThan(40) // Third starts after first batch
      expect(timeDiffs[2]).toBeLessThan(10) // Third and fourth start together
    })

    it("should handle batch execution", async () => {
      type BatchInput = number[]
      type BatchOutput = { sum: number, count: number, ids: number[] }
      
      // Flow that processes batches
      const batchProcessorFlow = flow.create(
        {
          name: "batchProcessor",
          inputSchema: custom<BatchInput>(),
          outputSchema: custom<BatchOutput>()
        },
        provide(() => async (batch) => {
          return {
            sum: batch.reduce((a, b) => a + b, 0),
            count: batch.length,
            ids: batch
          }
        })
      )

      const scope = createScope()
      
      // Test batch execution
      const batchFlow = flow.create(
        {
          name: "batchTest",
          inputSchema: custom<number[]>(),
          outputSchema: custom<BatchOutput[]>()
        },
        derive(
          batchProcessorFlow,
          (processor) => async (items, controller) => {
            return controller.executeBatch(processor, items, 3)
          }
        )
      )
      
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const result = await flow.execute(batchFlow, items, scope)
      
      expect(result.result.kind).toBe("success")
      if (result.result.kind === "success") {
        const batches = result.result.value
        expect(batches).toHaveLength(4) // 10 items in batches of 3
        expect(batches[0].count).toBe(3)
        expect(batches[0].ids).toEqual([1, 2, 3])
        expect(batches[3].count).toBe(1)
        expect(batches[3].ids).toEqual([10])
      }
    })

    it("should handle rate limiting with concurrent execution", async () => {
      const executionOrder: number[] = []
      
      // Flow that tracks execution order
      const orderTrackingFlow = flow.create(
        {
          name: "orderTracking",
          inputSchema: custom<{ id: number, delay: number }>(),
          outputSchema: custom<{ id: number, executedAt: number }>()
        },
        provide(() => async ({ id, delay }) => {
          executionOrder.push(id)
          await new Promise(resolve => setTimeout(resolve, delay))
          return { id, executedAt: Date.now() }
        })
      )

      const scope = createScope()
      
      // Test concurrent execution with rate limiting
      const concurrentFlow = flow.create(
        {
          name: "concurrentTest",
          inputSchema: custom<Array<{ id: number, delay: number }>>(),
          outputSchema: custom<Array<{ id: number, executedAt: number }>>()
        },
        derive(
          orderTrackingFlow,
          (tracking) => async (inputs, controller) => {
            executionOrder.length = 0 // Reset
            // Execute with concurrency limit of 2 and rate limit
            return controller.executeMany(tracking, inputs, {
              concurrency: 2,
              rateLimit: { maxConcurrent: 2 }
            })
          }
        )
      )
      
      const inputs = [
        { id: 1, delay: 100 },
        { id: 2, delay: 100 },
        { id: 3, delay: 100 },
        { id: 4, delay: 100 }
      ]
      
      const startTime = Date.now()
      const result = await flow.execute(concurrentFlow, inputs, scope)
      const totalTime = Date.now() - startTime
      
      expect(result.result.kind).toBe("success")
      
      // With concurrency 2, should process in 2 batches
      // Total time should be roughly 200ms (2 batches of 100ms each)
      expect(totalTime).toBeGreaterThanOrEqual(200)
      expect(totalTime).toBeLessThan(300)
      
      // First two should execute before last two
      expect(executionOrder.indexOf(1)).toBeLessThan(executionOrder.indexOf(3))
      expect(executionOrder.indexOf(2)).toBeLessThan(executionOrder.indexOf(4))
    })
  })
})