import { atom, controller } from "@pumped-fn/lite"
import { runCheck } from "./checker"
import { clock } from "./infra/clock"
import { serviceRevision, store } from "./infra/store"

export interface SchedulerHandle {
  scheduled: number
  pending(): number
}

export const scheduler = atom({
  keepAlive: true,
  deps: {
    clock,
    revision: controller(serviceRevision, { resolve: true, watch: true }),
    store,
  },
  factory: (ctx, { clock, store }): SchedulerHandle => {
    const pending = new Set<Promise<void>>()
    const cancels = store.services.list().map((service) =>
      clock.every(service.checkInterval * 1000, () => {
        const child = ctx.scope.createContext()
        const work = child.exec({ flow: runCheck, input: { serviceId: service.id } })
          .then(
            async () => {
              await child.close({ ok: true })
            },
            async (error) => {
              await child.close({ ok: false, error })
            }
          )
        pending.add(work)
        void work.finally(() => {
          pending.delete(work)
        })
      })
    )
    ctx.cleanup(async () => {
      for (const cancel of cancels) cancel()
      await Promise.all([...pending])
    })
    return {
      scheduled: cancels.length,
      pending: () => pending.size,
    }
  },
})
