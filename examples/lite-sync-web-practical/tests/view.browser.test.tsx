import { createScope } from "@pumped-fn/lite"
import { sync } from "@pumped-fn/lite-extension-sync"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { App } from "../src/app"
import { draft } from "../src/model"
import { createBrowserScope } from "../src/runtime"
import { web } from "../src/web"

const namespace = "workspace:browser"
const token = "secret"

describe("sync web React boundary", () => {
  test("renders synced state through normal lite-react observers", async () => {
    const wire = sync.memory()
    const gateway = web.server({
      namespace,
      transport: wire,
      authorize: (value) => value === token,
    })
    const browser = createBrowserScope({
      gateway,
      token,
      peer: "browser",
      namespace,
    })
    const backend = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "backend",
          namespace,
          transport: wire,
        }),
      ],
    })
    const backendDraft = await backend.controller(draft, { resolve: true })

    const view = render(<App scope={browser} actor="browser" />)

    expect(await screen.findByText("Untitled")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "save browser edit" }))

    expect(await screen.findByText("Untitled from browser")).toBeInTheDocument()
    await until(() => backendDraft.get().savedBy === "browser")
    expect(backendDraft.get()).toMatchObject({
      title: "Untitled from browser",
      savedBy: "browser",
      version: 1,
    })

    view.unmount()
    await browser.dispose()
    await backend.dispose()
    await gateway.close()
  })
})

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("condition did not settle")
}
