import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom } from "../src/atom"

describe("scope.select()", () => {
  describe("basic functionality", () => {
    it("returns SelectHandle with get()", async () => {
      const scope = await createScope()
      const todosAtom = atom({ factory: () => [
        { id: "1", text: "Learn TypeScript" },
        { id: "2", text: "Build app" }
      ]})

      await scope.resolve(todosAtom)

      const handle = scope.select(
        todosAtom,
        (todos) => todos.find(t => t.id === "1")
      )

      expect(handle).toBeDefined()
      expect(handle.get).toBeTypeOf("function")
      expect(handle.subscribe).toBeTypeOf("function")
      expect(handle.get()).toEqual({ id: "1", text: "Learn TypeScript" })
    })
  })
})
