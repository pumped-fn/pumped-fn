import { describe, expect, it } from "vitest"
import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { extension as suspenseExtension } from "@pumped-fn/lite-extension-suspense"
import {
  eventLog,
  formatStepKey,
  step,
  units,
  workflow,
  workflowExtension,
  workflowExtensionUnits,
  workflowRun,
  type WorkflowEventLog,
  type WorkflowStepEntry,
  type WorkflowStepKey,
} from "../src"

class MemoryWorkflowLog implements WorkflowEventLog {
  private readonly store = new Map<string, WorkflowStepEntry>()

  async get(key: WorkflowStepKey): Promise<WorkflowStepEntry | undefined> {
    return this.store.get(formatStepKey(key))
  }

  async putPending(entry: Extract<WorkflowStepEntry, { status: "pending" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async putCompleted(entry: Extract<WorkflowStepEntry, { status: "completed" }>): Promise<void> {
    this.store.set(formatStepKey(entry.key), entry)
  }

  async resolve(key: WorkflowStepKey, value: unknown): Promise<void> {
    const current = this.store.get(formatStepKey(key))
    if (!current || current.status !== "pending") throw new Error(`Pending step "${formatStepKey(key)}" not found`)
    this.store.set(formatStepKey(key), {
      status: "resolved",
      key,
      targetName: current.targetName,
      value,
    })
  }

  entries(): WorkflowStepEntry[] {
    return [...this.store.values()]
  }
}

describe("workflow extension", () => {
  it("memoizes workflow steps and exposes runtime identity", async () => {
    const log = new MemoryWorkflowLog()
    const scope = createScope({ tags: [eventLog(log)], extensions: [workflowExtension()] })
    await scope.ready
    let calls = 0
    const worker = flow({
      name: "workflow-worker",
      parse: typed<number>(),
      tags: [step({ workflow: true })],
      deps: { workflow: tags.required(workflow) },
      factory: (ctx, deps) => {
        calls++
        return `${deps.workflow.taskId}:${deps.workflow.runId}:${ctx.input}`
      },
    })

    const first = scope.createContext({ tags: [workflowRun({ taskId: "task-a", runId: "run-a" })] })
    expect(await first.exec({ flow: worker, input: 1 })).toBe("task-a:run-a:1")
    await first.close()

    const second = scope.createContext({ tags: [workflowRun({ taskId: "task-a", runId: "run-a" })] })
    expect(await second.exec({ flow: worker, input: 2 })).toBe("task-a:run-a:1")
    await second.close()

    expect(calls).toBe(1)
  })

  it("composes workflow behavior through suspense units", async () => {
    const log = new MemoryWorkflowLog()
    const scope = createScope({
      tags: [
        eventLog(log),
        units(workflowExtensionUnits()),
      ],
      extensions: [suspenseExtension({
        name: "workflow-units",
      })],
    })
    await scope.ready
    let calls = 0
    const worker = flow({
      name: "unit-worker",
      tags: [step({ workflow: true, key: "unit-worker" })],
      factory: () => {
        calls++
        return "ok"
      },
    })

    const first = scope.createContext({ tags: [workflowRun({ taskId: "task-unit", runId: "run-unit" })] })
    expect(await first.exec({ flow: worker })).toBe("ok")
    await first.close()

    const second = scope.createContext({ tags: [workflowRun({ taskId: "task-unit", runId: "run-unit" })] })
    expect(await second.exec({ flow: worker })).toBe("ok")
    await second.close()

    expect(calls).toBe(1)
    expect(log.entries()).toContainEqual(expect.objectContaining({
      status: "completed",
      key: { taskId: "task-unit", runId: "run-unit", step: "unit-worker" },
      targetName: "unit-worker",
    }))
  })
})
