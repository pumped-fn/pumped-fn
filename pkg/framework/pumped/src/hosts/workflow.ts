import { randomUUID } from "node:crypto"
import { atom, type Lite } from "@pumped-fn/lite"
import type { Manifest } from "../runtime/manifest"
import { workflow, workflowRun, type WorkflowSpec } from "../tags"
import { HostStartError, selectEntries, type Host, type HostRuntime } from "./host"

/** Receives workflow failures instead of the default stderr line. */
export interface WorkflowIo {
  onError(name: string, error: unknown): void
}

export const workflowHost: Host<WorkflowSpec, { io?: WorkflowIo }> = Object.freeze({
  name: "workflow",
  selector: workflow,
  provides: Object.freeze([workflowRun]),
  start({ scope, manifest, io }: { scope: Lite.Scope; manifest: Manifest; io?: WorkflowIo }): HostRuntime {
    const onError =
      io?.onError ??
      ((name: string, error: unknown) => {
        process.stderr.write(`${name}: ${error instanceof Error ? error.message : String(error)}\n`)
      })

    const names = new Map<string, string>()
    const open = new Set<Lite.ExecutionContext>()
    const planned: { name: string; launch(): Promise<void> }[] = []

    for (const selection of selectEntries(manifest, workflow)) {
      const bundle = scope.resolve(selection.entry)
      for (const mount of selection.mounts) {
        const name = mount.spec.name ?? selection.name
        const existing = names.get(name)
        if (existing) {
          throw new HostStartError("duplicate-workflow", `duplicate workflow "${name}": ${existing}, ${selection.name}`)
        }
        names.set(name, selection.name)

        planned.push({
          name,
          launch: async () => {
            const { flow } = await bundle
            const execution = scope.createContext({
              tags: [workflowRun({ name, runId: randomUUID() }), mount.tagged, selection.tags],
            })
            open.add(execution)
            try {
              await execution.exec({ flow, rawInput: undefined })
              await execution.close({ ok: true })
            } catch (error) {
              await execution.close({ ok: false, error }).catch((closeError) => onError(name, closeError))
              onError(name, error)
            } finally {
              open.delete(execution)
            }
          },
        })
      }
    }

    const node = atom({
      factory: (ctx) => {
        const runs = planned.map((plan) => plan.launch())

        ctx.cleanup(async () => {
          await Promise.allSettled(
            [...open].map((execution) => execution.close({ ok: false, error: new Error("scope disposed") }))
          )
          await Promise.allSettled(runs)
        })

        return { runs }
      },
    })

    const resolved = scope.resolve(node)
    return {
      ready: resolved.then(() => undefined),
      stop: async () => {
        const value = await resolved.catch(() => undefined)
        if (value) await Promise.allSettled(value.runs)
        await scope.release(node)
      },
    }
  },
})
