import { describe, test, expect } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { createScope, preset } from "@pumped-fn/lite"
import { ScopeProvider } from "@pumped-fn/lite-react"
import { ProductList } from "./view"
import { products, type Product } from "./after"

const sample: Product[] = [
  { id: "a", name: "Banana", price: 3 },
  { id: "b", name: "apple", price: 5 },
  { id: "c", name: "Cherry", price: 1 },
]

function renderList() {
  const scope = createScope({ presets: [preset(products, sample)] })
  render(
    <ScopeProvider scope={scope}>
      <ProductList />
    </ScopeProvider>
  )
  return scope
}

async function rowNames(): Promise<string[]> {
  const list = await screen.findByRole("list")
  return within(list)
    .getAllByRole("listitem")
    .map((li) => li.textContent?.split(" — ")[0] ?? "")
}

describe("outside-in", () => {
  test("OI1: the list observes the graph — initial order is by name", async () => {
    const scope = renderList()
    expect(await rowNames()).toEqual(["apple", "Banana", "Cherry"])
    await scope.dispose()
  })

  test("OI2: typing in the filter narrows the rows", async () => {
    const scope = renderList()
    await rowNames()
    fireEvent.change(screen.getByLabelText("filter"), { target: { value: "an" } })
    expect(await rowNames()).toEqual(["Banana"])
    await scope.dispose()
  })

  test("OI3: changing the sort reorders the rows", async () => {
    const scope = renderList()
    await rowNames()
    fireEvent.change(screen.getByLabelText("sort"), { target: { value: "price" } })
    expect(await rowNames()).toEqual(["Cherry", "Banana", "apple"])
    await scope.dispose()
  })
})
