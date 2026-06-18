import { describe, test, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { atom, createScope } from "@pumped-fn/lite"
import { ScopeProvider, useAtom } from "@pumped-fn/lite-react"

describe("outside-in", () => {
  test("browser observer tests render a component through ScopeProvider", async () => {
    expect(typeof document).toBe("object")

    const greeting = atom({ factory: () => "hello from the graph" })
    const scope = createScope()

    function Greeting() {
      const { data } = useAtom(greeting, { suspense: false, resolve: true })
      return <span>{data ?? "..."}</span>
    }

    render(
      <ScopeProvider scope={scope}>
        <Greeting />
      </ScopeProvider>
    )

    expect(await screen.findByText("hello from the graph")).toBeInTheDocument()
    await scope.dispose()
  })
})
