import { describe, expect, test } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
    await waitFor(() => {
      expect(screen.getByText("Login shell v2")).toBeInTheDocument()
    })
    expect(screen.getByText("6 points")).toBeInTheDocument()

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
    await waitFor(() => {
      expect(within(screen.getByLabelText("Done")).getByText("API contract")).toBeInTheDocument()
    })
    expect(within(screen.getByLabelText("Done")).getByText("2/99")).toBeInTheDocument()
    expect((await scope.resolve(boardAudit)).map((event) => event.type)).toContain("move")

    await scope.dispose()
  })

  test("K-OI2: nested card editors keep sibling draft state local to their provider", async () => {
    const scope = createScope({
      tags: [workspaceId("acme"), activeProjectId("p-web")],
    })

    function Shell({ marker }: { marker: string }) {
      return (
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider tags={[actorId("u2")]}>
            <span>{marker}</span>
            <KanbanBoard />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
    }

    const view = render(<Shell marker="one" />)

    expect(await screen.findByText("Web Experience")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("title c-login"), { target: { value: "Login draft" } })
    fireEvent.change(screen.getByLabelText("title c-api"), { target: { value: "API draft" } })

    expect(screen.getByLabelText("title c-login")).toHaveValue("Login draft")
    expect(screen.getByLabelText("title c-api")).toHaveValue("API draft")
    view.rerender(<Shell marker="two" />)
    expect(screen.getByText("two")).toBeInTheDocument()
    expect(screen.getByLabelText("title c-login")).toHaveValue("Login draft")
    expect(screen.getByLabelText("title c-api")).toHaveValue("API draft")

    fireEvent.change(screen.getByLabelText("search cards"), { target: { value: "api" } })
    await waitFor(() => {
      expect(screen.queryByLabelText("title c-login")).toBeNull()
    })

    fireEvent.change(screen.getByLabelText("search cards"), { target: { value: "login" } })
    await waitFor(() => {
      expect(screen.getByLabelText("title c-login")).toHaveValue("Login shell")
    })

    await scope.dispose()
  })
})
