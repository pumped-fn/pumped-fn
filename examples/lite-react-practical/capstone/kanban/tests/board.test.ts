import { describe, expect, test } from "vitest"
import { createScope, flow, preset } from "@pumped-fn/lite"
import {
  actionAudit,
  activeProjectId,
  actorId,
  boardAudit,
  boardFilters,
  boardSession,
  boardState,
  boardView,
  cardDraft,
  demoKanbanState,
  editingCardId,
  moveCard,
  saveCardDraft,
  summarizeCard,
  workspaceId,
  type BoardSession,
} from "../src/board"

describe("inside-out", () => {
  test("K1: board view derives lanes, blockers, workload, and warnings from map-backed state", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })

    const view = await scope.resolve(boardView)

    expect(view.workspaceId).toBe("acme")
    expect(view.project.name).toBe("Web Experience")
    expect(view.summary).toEqual({ cards: 5, points: 17, blocked: 1, overloadedUsers: 1 })
    expect(view.lanes.map((lane) => [lane.id, lane.cards.map((card) => card.id)])).toEqual([
      ["backlog", []],
      ["ready", ["c-api"]],
      ["doing", ["c-login", "c-perf"]],
      ["review", ["c-copy"]],
      ["done", ["c-foundation"]],
    ])
    expect(view.lanes[2]!.overLimit).toBe(true)
    expect(view.lanes[2]!.cards[1]!.blocked).toBe(true)
    expect(view.workloads.find((row) => row.userId === "u2")).toEqual({
      userId: "u2",
      name: "Jules",
      points: 12,
      capacity: 5,
      overloaded: true,
    })
    expect(view.warnings).toEqual([
      "doing exceeds WIP 2/1",
      "Jules exceeds capacity 12/5",
      "1 blocked card",
    ])

    const filters = await scope.controller(boardFilters, { resolve: true })
    filters.set({ query: "api", assigneeId: "u2", showBlocked: false })
    await scope.flush()

    const filtered = await scope.resolve(boardView)
    expect(filtered.summary).toEqual({ cards: 1, points: 5, blocked: 0, overloadedUsers: 1 })
    expect(filtered.lanes.map((lane) => [lane.id, lane.cards.map((card) => card.id)])).toEqual([
      ["backlog", []],
      ["ready", ["c-api"]],
      ["doing", []],
      ["review", []],
      ["done", []],
    ])

    await scope.dispose()
  })

  test("K2: moveCard uses current-owned audit across nested exec children", async () => {
    const executions: string[] = []
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
      extensions: [
        {
          name: "kanban-trace",
          wrapExec: async (next, target) => {
            executions.push(typeof target === "function" ? "fn" : target.name ?? "anonymous")
            return next()
          },
        },
      ],
    })
    const ctx = scope.createContext({ tags: [actorId("u2")] })

    await ctx.exec({ flow: moveCard, input: { cardId: "c-api", toLaneId: "done", toIndex: 1 } })
    await scope.flush()

    const state = await scope.resolve(boardState)
    expect(state.cards.get("c-api")?.laneId).toBe("done")
    expect(state.laneCardIds.get("p-web")?.get("done")).toEqual(["c-foundation", "c-api"])
    expect((await scope.resolve(boardAudit)).map((event) => event.type)).toEqual(["move", "snapshot"])
    expect((await scope.resolve(boardView)).recentAudit.map((event) => event.type)).toEqual(["move", "snapshot"])
    expect(executions).toEqual(["kanban.moveCard", "kanban.summarizeCard"])

    await ctx.close()
    await scope.dispose()
  })

  test("K3: moveCard reorders cards inside the active lane without losing membership", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })
    const ctx = scope.createContext({ tags: [actorId("u2")] })

    await ctx.exec({ flow: moveCard, input: { cardId: "c-perf", toLaneId: "doing", toIndex: 0 } })
    await scope.flush()

    const state = await scope.resolve(boardState)
    expect(state.cards.get("c-perf")?.laneId).toBe("doing")
    expect(state.laneCardIds.get("p-web")?.get("doing")).toEqual(["c-perf", "c-login"])
    expect((await scope.resolve(boardView)).lanes.find((lane) => lane.id === "doing")?.cards.map((card) => card.id))
      .toEqual(["c-perf", "c-login"])

    await ctx.close()
    await scope.dispose()
  })

  test("K4: presets replace state and resources at the scope seam", async () => {
    const state = demoKanbanState()
    state.projects.set("p-web", { ...state.projects.get("p-web")!, name: "Preset Web" })
    const session: BoardSession = { workspaceId: "preset-workspace", actorId: "preset-user" }
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web"), actorId("u2")],
      presets: [preset(boardState, state), preset(boardSession, session)],
    })
    const ctx = scope.createContext({ tags: [actorId("u2")] })

    expect(await ctx.resolve(boardSession)).toEqual(session)
    expect((await scope.resolve(boardView)).project.name).toBe("Preset Web")

    await ctx.close()
    await scope.dispose()
  })

  test("K5: editing-card boundary tags compare recreated object values by card id", () => {
    expect(editingCardId.same(editingCardId({ cardId: "c-login" }), editingCardId({ cardId: "c-login" })))
      .toBe(true)
    expect(editingCardId.same(editingCardId({ cardId: "c-login" }), editingCardId({ cardId: "c-api" })))
      .toBe(false)
  })

  test("K6: scoped card drafts are isolated by nested explicit execution boundary", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })
    const root = scope.createContext({ tags: [actorId("u2")] })
    const first = scope.createContext({ parent: root, tags: [editingCardId({ cardId: "c-login" })] })
    const second = scope.createContext({ parent: root, tags: [editingCardId({ cardId: "c-api" })] })

    const firstDraft = await first.resolve(cardDraft)
    const secondDraft = await second.resolve(cardDraft)
    firstDraft.actions.setTitle("Rewrite login shell")
    firstDraft.actions.setPoints(8)
    firstDraft.actions.setReviewerId("u1")

    expect(firstDraft.get().title).toBe("Rewrite login shell")
    expect(firstDraft.get().reviewerId).toBe("u1")
    expect(secondDraft.get().title).toBe("API contract")
    expect(firstDraft).not.toBe(secondDraft)

    await first.exec({ flow: saveCardDraft })
    await scope.flush()

    const state = await scope.resolve(boardState)
    expect(state.cards.get("c-login")?.title).toBe("Rewrite login shell")
    expect(state.cards.get("c-login")?.points).toBe(8)
    expect(state.cards.get("c-login")?.reviewerId).toBe("u1")

    await first.close()
    expect(firstDraft.disposed).toBe(true)
    expect(secondDraft.disposed).toBe(false)

    await second.close()
    await root.close()
    await scope.dispose()
  })

  test("K7: failed draft save rolls back through the action resource", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })
    const root = scope.createContext({ tags: [actorId("u2")] })
    const card = scope.createContext({ parent: root, tags: [editingCardId({ cardId: "c-login" })] })
    const draft = await card.resolve(cardDraft)
    draft.actions.setTitle(" ")

    await expect(card.exec({ flow: saveCardDraft })).rejects.toThrow("card title is required")
    await scope.flush()

    expect(await scope.resolve(boardAudit)).toEqual([
      {
        type: "rollback",
        workspaceId: "acme",
        actorId: "u2",
        cardId: "c-login",
        detail: "card title is required",
      },
    ])

    await card.close()
    await root.close()
    await scope.dispose()
  })

  test("K8: graph actions stay inside the active project boundary", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })
    const root = scope.createContext({ tags: [actorId("u2")] })
    const mobileCard = scope.createContext({ parent: root, tags: [editingCardId({ cardId: "m-shell" })] })

    await expect(root.exec({ flow: moveCard, input: { cardId: "m-shell", toLaneId: "done", toIndex: 0 } }))
      .rejects.toThrow("card m-shell is not in active project p-web")
    await expect(mobileCard.resolve(cardDraft)).rejects.toThrow("card m-shell is not in active project p-web")

    await mobileCard.close()
    await root.close()
    await scope.dispose()
  })

  test("K9: draft saves validate referenced reviewer data before mutating board state", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })
    const root = scope.createContext({ tags: [actorId("u2")] })
    const card = scope.createContext({ parent: root, tags: [editingCardId({ cardId: "c-login" })] })
    const draft = await card.resolve(cardDraft)

    draft.actions.setReviewerId("missing")

    await expect(card.exec({ flow: saveCardDraft })).rejects.toThrow("reviewer missing not found")
    await scope.flush()
    expect((await scope.resolve(boardState)).cards.get("c-login")?.reviewerId).toBe("u3")

    await card.close()
    await root.close()
    await scope.dispose()
  })

  test("K10: invalid graph actions fail through the same execution seam", async () => {
    const stringFailure = flow({
      name: "kanban.stringFailure",
      deps: { audit: actionAudit },
      factory: (_ctx, { audit }) => {
        audit.record({ type: "snapshot", cardId: "board", detail: "before failure" })
        throw "non-error failure"
      },
    })
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })
    const root = scope.createContext({ tags: [actorId("u2")] })

    await expect(root.exec({ flow: moveCard, input: { cardId: "missing", toLaneId: "done", toIndex: 0 } }))
      .rejects.toThrow("card missing not found")
    await expect(root.exec({ flow: moveCard, input: { cardId: "c-api", toLaneId: "blocked" as never, toIndex: 0 } }))
      .rejects.toThrow("lane blocked is not in project p-web")
    await expect(root.exec({ flow: summarizeCard, input: { cardId: "missing" } }))
      .rejects.toThrow("card missing not found")

    const missingDraft = scope.createContext({ parent: root, tags: [editingCardId({ cardId: "missing" })] })
    await expect(missingDraft.resolve(cardDraft)).rejects.toThrow("card missing not found")
    await missingDraft.close()

    const card = scope.createContext({ parent: root, tags: [editingCardId({ cardId: "c-login" })] })
    await card.resolve(cardDraft)
    const stateControl = await scope.controller(boardState, { resolve: true })

    const crossProject = demoKanbanState()
    crossProject.cards.set("c-login", { ...crossProject.cards.get("c-login")!, projectId: "p-mobile" })
    stateControl.set(crossProject)
    await scope.flush()
    await expect(card.exec({ flow: saveCardDraft })).rejects.toThrow("card c-login is not in active project p-web")

    const withoutLogin = demoKanbanState()
    withoutLogin.cards.delete("c-login")
    stateControl.set(withoutLogin)
    await scope.flush()
    await expect(card.exec({ flow: saveCardDraft })).rejects.toThrow("card c-login not found")
    await card.close()

    await expect(root.exec({ flow: stringFailure })).rejects.toBe("non-error failure")
    await scope.flush()
    expect((await scope.resolve(boardAudit)).at(-1)).toEqual({
      type: "rollback",
      workspaceId: "acme",
      actorId: "u2",
      cardId: "board",
      detail: "action failed",
    })

    await root.close()
    await scope.dispose()
  })
})
