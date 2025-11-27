import { describe, it, expect } from "vitest"
import { flow, isFlow } from "../src/flow"
import { atom } from "../src/atom"
import { tag, tags } from "../src/tag"

describe("Flow", () => {
  describe("flow()", () => {
    it("creates a flow without deps", () => {
      const myFlow = flow({
        factory: (ctx) => ctx.input,
      })

      expect(isFlow(myFlow)).toBe(true)
      expect(myFlow.deps).toBeUndefined()
    })

    it("creates a flow with deps", () => {
      const dbAtom = atom({ factory: () => ({ query: () => [] }) })
      const requestId = tag<string>({ label: "requestId" })

      const myFlow = flow({
        deps: { db: dbAtom, reqId: tags.required(requestId) },
        factory: (ctx, { db, reqId }) => {
          return { db, reqId, input: ctx.input }
        },
      })

      expect(isFlow(myFlow)).toBe(true)
      expect(myFlow.deps).toBeDefined()
    })

  })
})
