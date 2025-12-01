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

    it("throws if atom not resolved", async () => {
      const scope = await createScope()
      const todosAtom = atom({ factory: () => [{ id: "1", text: "Test" }] })

      expect(() => {
        scope.select(todosAtom, (todos) => todos[0])
      }).toThrow("Cannot select from unresolved atom")
    })
  })

  describe("equality", () => {
    it("uses reference equality by default", async () => {
      const scope = await createScope()
      const obj1 = { id: "1" }
      const obj2 = { id: "1" }
      let resolveCount = 0
      const dataAtom = atom({
        factory: () => {
          resolveCount++
          return resolveCount === 1 ? obj1 : obj2
        }
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(dataAtom, (data) => data)

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(1)
    })

    it("does not notify when reference is same", async () => {
      const scope = await createScope()
      const sharedObj = { id: "1" }
      const dataAtom = atom({ factory: () => sharedObj })

      await scope.resolve(dataAtom)
      const handle = scope.select(dataAtom, (data) => data)

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(0)
    })

    it("uses custom eq function", async () => {
      const scope = await createScope()
      let version = 1
      const dataAtom = atom({
        factory: () => ({ id: "1", version: version++ })
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(
        dataAtom,
        (data) => data,
        { eq: (a, b) => a.id === b.id }
      )

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(0)
    })

    it("notifies when custom eq returns false", async () => {
      const scope = await createScope()
      let id = 1
      const dataAtom = atom({
        factory: () => ({ id: String(id++) })
      })

      await scope.resolve(dataAtom)
      const handle = scope.select(
        dataAtom,
        (data) => data,
        { eq: (a, b) => a.id === b.id }
      )

      let notifyCount = 0
      handle.subscribe(() => notifyCount++)

      const ctrl = scope.controller(dataAtom)
      ctrl.invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyCount).toBe(1)
      expect(handle.get().id).toBe("2")
    })
  })

  describe("subscription", () => {
    it("supports multiple subscribers", async () => {
      const scope = await createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      let count1 = 0
      let count2 = 0
      handle.subscribe(() => count1++)
      handle.subscribe(() => count2++)

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(count1).toBe(1)
      expect(count2).toBe(1)
    })

    it("unsubscribe removes specific listener", async () => {
      const scope = await createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      let count1 = 0
      let count2 = 0
      const unsub1 = handle.subscribe(() => count1++)
      handle.subscribe(() => count2++)

      unsub1()

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(count1).toBe(0)
      expect(count2).toBe(1)
    })
  })
})
