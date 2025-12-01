import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom } from "../src/atom"

describe("scope.select()", () => {
  describe("basic functionality", () => {
    it("returns SelectHandle with get()", async () => {
      const scope = createScope()
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
      const scope = createScope()
      const todosAtom = atom({ factory: () => [{ id: "1", text: "Test" }] })

      expect(() => {
        scope.select(todosAtom, (todos) => todos[0])
      }).toThrow("Cannot select from unresolved atom")
    })
  })

  describe("equality", () => {
    it("uses reference equality by default", async () => {
      const scope = createScope()
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
      const scope = createScope()
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
      const scope = createScope()
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
      const scope = createScope()
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
      const scope = createScope()
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
      const scope = createScope()
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

    it("auto-cleans when last subscriber unsubscribes", async () => {
      const scope = createScope()
      let value = 1
      const numAtom = atom({ factory: () => value++ })

      await scope.resolve(numAtom)
      const handle = scope.select(numAtom, (n) => n)

      const unsub1 = handle.subscribe(() => {})
      const unsub2 = handle.subscribe(() => {})

      unsub1()
      unsub2()

      scope.controller(numAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(handle.get()).toBe(1)
    })
  })

  describe("selector execution", () => {
    it("only runs selector when atom is resolved", async () => {
      const scope = createScope()
      let selectorCalls = 0
      const asyncAtom = atom({
        factory: async () => {
          await new Promise(r => setTimeout(r, 30))
          return 42
        }
      })

      await scope.resolve(asyncAtom)
      const handle = scope.select(asyncAtom, (n) => {
        selectorCalls++
        return n * 2
      })

      expect(selectorCalls).toBe(1)
      expect(handle.get()).toBe(84)

      handle.subscribe(() => {})

      scope.controller(asyncAtom).invalidate()

      await new Promise(r => setTimeout(r, 10))
      const callsDuringResolving = selectorCalls

      await new Promise(r => setTimeout(r, 50))
      const callsAfterResolved = selectorCalls

      expect(callsDuringResolving).toBe(1)
      expect(callsAfterResolved).toBe(2)
    })
  })

  describe("multiple selects", () => {
    it("multiple selects on same atom work independently", async () => {
      const scope = createScope()
      let count = 0
      const dataAtom = atom({
        factory: () => ({ a: count++, b: count++ })
      })

      await scope.resolve(dataAtom)

      const handleA = scope.select(dataAtom, (d) => d.a)
      const handleB = scope.select(dataAtom, (d) => d.b)

      expect(handleA.get()).toBe(0)
      expect(handleB.get()).toBe(1)

      let notifyA = 0
      let notifyB = 0
      handleA.subscribe(() => notifyA++)
      handleB.subscribe(() => notifyB++)

      scope.controller(dataAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notifyA).toBe(1)
      expect(notifyB).toBe(1)
      expect(handleA.get()).toBe(2)
      expect(handleB.get()).toBe(3)
    })
  })

  describe("TodoItem use case", () => {
    it("only notifies when specific todo changes", async () => {
      interface Todo {
        id: string
        text: string
        updatedAt: number
      }

      const scope = createScope()
      let todos: Todo[] = [
        { id: "1", text: "Learn", updatedAt: 100 },
        { id: "2", text: "Build", updatedAt: 200 },
        { id: "3", text: "Ship", updatedAt: 300 }
      ]

      const todosAtom = atom({ factory: () => [...todos] })
      await scope.resolve(todosAtom)

      const handle1 = scope.select(
        todosAtom,
        (t) => t.find(x => x.id === "1"),
        { eq: (a, b) => a?.updatedAt === b?.updatedAt }
      )

      const handle2 = scope.select(
        todosAtom,
        (t) => t.find(x => x.id === "2"),
        { eq: (a, b) => a?.updatedAt === b?.updatedAt }
      )

      let notify1 = 0
      let notify2 = 0
      handle1.subscribe(() => notify1++)
      handle2.subscribe(() => notify2++)

      todos = [
        { id: "1", text: "Learn", updatedAt: 100 },
        { id: "2", text: "Build MORE", updatedAt: 201 },
        { id: "3", text: "Ship", updatedAt: 300 }
      ]

      scope.controller(todosAtom).invalidate()
      await new Promise(r => setTimeout(r, 50))

      expect(notify1).toBe(0)
      expect(notify2).toBe(1)
      expect(handle2.get()?.text).toBe("Build MORE")
    })
  })
})
