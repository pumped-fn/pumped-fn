// @vitest-environment jsdom
import { describe, expect, test } from "vitest"
import { fireEvent, screen } from "@testing-library/react"
import { mountMain } from "./main"

describe("outside-in", () => {
  test("OI1: main creates the scope once and renders the observer under ScopeProvider", async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const app = mountMain()

    expect(await screen.findByRole("button", { name: "count 0" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "count 0" }))
    expect(await screen.findByRole("button", { name: "count 1" })).toBeInTheDocument()

    await app.unmount()
    expect(document.getElementById("root")?.textContent).toBe("")
  })

  test("OI2: missing root is an adapter error at bootstrap", () => {
    document.body.innerHTML = ""
    expect(() => mountMain()).toThrow("root container missing")
  })
})
