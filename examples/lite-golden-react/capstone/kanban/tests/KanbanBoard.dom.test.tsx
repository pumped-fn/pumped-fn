// @vitest-environment jsdom
import { describe, expect, test } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Suspense } from "react"
import { createScope } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { activeProjectId, actorId, boardAudit, boardState, workspaceId } from "../src/board"
import { KanbanBoard } from "../src/KanbanBoard"

describe("outside-in", () => {
  test("K-OI1: observer renders derived board state and dispatches graph actions through nested contexts", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })

    render(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider tags={[actorId("u2")]}>
          <Suspense fallback={<div>loading kanban</div>}>
            <KanbanBoard />
          </Suspense>
        </ExecutionContextProvider>
      </ScopeProvider>,
    )

    expect(await screen.findByText("Web Experience")).toBeInTheDocument()
    expect(screen.getByText("cards 5")).toBeInTheDocument()
    expect(screen.getByText("blocked 1")).toBeInTheDocument()
    expect(screen.getByText("doing exceeds WIP 2/1")).toBeInTheDocument()
    expect(screen.getByText("API contract")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("search cards"), { target: { value: "login" } })
    await waitFor(() => {
      expect(screen.getByText("Login shell")).toBeInTheDocument()
    })
    expect(screen.queryByText("API contract")).toBeNull()

    fireEvent.change(screen.getByLabelText("title c-login"), { target: { value: "Login shell v2" } })
    fireEvent.change(screen.getByLabelText("points c-login"), { target: { value: "6" } })
    fireEvent.click(screen.getByLabelText("save c-login"))

    await waitFor(async () => {
      expect((await scope.resolve(boardState)).cards.get("c-login")?.title).toBe("Login shell v2")
    })
    expect((await scope.resolve(boardState)).cards.get("c-login")?.points).toBe(6)

    fireEvent.change(screen.getByLabelText("title c-login"), { target: { value: " " } })
    fireEvent.click(screen.getByLabelText("save c-login"))
    await waitFor(async () => {
      expect((await scope.resolve(boardAudit)).map((event) => event.type)).toContain("rollback")
    })

    fireEvent.change(screen.getByLabelText("search cards"), { target: { value: "api" } })
    await waitFor(() => {
      expect(screen.getByText("API contract")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText("move c-api to done"))

    await waitFor(async () => {
      expect((await scope.resolve(boardState)).cards.get("c-api")?.laneId).toBe("done")
    })
    expect((await scope.resolve(boardAudit)).map((event) => event.type)).toContain("move")

    await scope.dispose()
  })
})
