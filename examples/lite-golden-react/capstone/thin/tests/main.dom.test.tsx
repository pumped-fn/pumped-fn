// @vitest-environment jsdom
import { describe, expect, test } from "vitest"
import { screen } from "@testing-library/react"
import { mountMain } from "../src/main"

describe("outside-in", () => {
  test("OI1: thin main mounts the login shell under a real scope", async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const app = mountMain()

    expect(await screen.findByRole("button", { name: "sign in" })).toBeInTheDocument()

    await app.unmount()
    expect(document.getElementById("root")?.textContent).toBe("")
  })

  test("OI2: missing root is a bootstrap adapter error", () => {
    document.body.innerHTML = ""
    expect(() => mountMain()).toThrow("root container missing")
  })
})
