import { describe, expect, test } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { defineCatalog } from "@json-render/core"
import { JSONUIProvider, Renderer, defineRegistry } from "@json-render/react"
import { schema } from "@json-render/react/schema"
import { createScope, flow, tag, typed } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { flowAction, useFlowHandlers } from "@pumped-fn/lite-react-json-render"
import { useMemo } from "react"
import { z } from "zod"
import { orderDraft } from "./after"
import { JsonRenderOrder } from "./view"

const actionSink = tag<{ records: string[] }>({ label: "json-render.action-sink" })

const record = flow({
  name: "json-render-record-action",
  parse: typed<{ label: string }>(),
  factory: (ctx) => {
    ctx.data.getTag(actionSink)!.records.push(ctx.input.label)
  },
})

const actionCatalog = defineCatalog(schema, {
  components: {
    ActionButton: {
      props: z.object({
        label: z.string(),
      }),
    },
  },
  actions: {},
})

const { registry: actionRegistry } = defineRegistry(actionCatalog, {
  components: {
    ActionButton: ({ props, emit }) => (
      <button type="button" onClick={() => emit("press")}>
        {props.label}
      </button>
    ),
  },
})

const actionSpec = {
  root: "button",
  elements: {
    button: {
      type: "ActionButton",
      props: {
        label: "Record",
      },
      on: {
        press: {
          action: "record",
          params: {
            label: "pressed",
          },
        },
      },
      children: [],
    },
  },
}

function ActionHarness({ sink }: { sink: { records: string[] } }) {
  const actions = useMemo(() => ({
    record: flowAction({
      flow: record,
      tags: [actionSink(sink)],
    }),
  }), [sink])
  const handlers = useFlowHandlers(actions)

  return (
    <JSONUIProvider registry={actionRegistry} handlers={handlers} initialState={{}}>
      <Renderer spec={actionSpec} registry={actionRegistry} />
    </JSONUIProvider>
  )
}

describe("outside-in", () => {
  test("OI1: json-render waits for the Lite scoped value boundary", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const view = render(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider ctx={ctx}>
          <JsonRenderOrder />
        </ExecutionContextProvider>
      </ScopeProvider>
    )

    expect(view.container).toBeEmptyDOMElement()

    view.unmount()
    await ctx.close()
    await scope.dispose()
  })

  test("OI2: json-render reads and writes a Lite scoped value through StateProvider", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await orderDraft.resolve(ctx)
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <JsonRenderOrder />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const quantity = await screen.findByRole("spinbutton", { name: "Quantity" })
    expect(quantity).toHaveValue(1)
    expect(await screen.findByLabelText("order summary")).toHaveTextContent("Coffee: 1")
    expect(await screen.findByLabelText("submission status")).toHaveTextContent("Not submitted")

    await act(async () => {
      fireEvent.change(quantity, { target: { value: "4" } })
      await Promise.resolve()
    })
    expect(await screen.findByLabelText("order summary")).toHaveTextContent("Coffee: 4")

    const draft = await orderDraft.resolve(ctx)
    expect(draft.getSnapshot()).toEqual({
      order: {
        item: "Coffee",
        quantity: 4,
      },
      submission: null,
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit order" }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(await screen.findByLabelText("submission status")).toHaveTextContent("Submitted Coffee x 4")
    expect(draft.getSnapshot()).toEqual({
      order: {
        item: "Coffee",
        quantity: 4,
      },
      submission: {
        message: "Submitted Coffee x 4",
      },
    })

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })

  test("OI3: json-render keeps the latest Lite action handler target without remounting provider", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const firstSink = { records: [] }
    const secondSink = { records: [] }
    let view: ReturnType<typeof render>

    await act(async () => {
      view = render(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <ActionHarness sink={firstSink} />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Record" }))
      await Promise.resolve()
    })
    expect(firstSink.records).toEqual(["pressed"])
    expect(secondSink.records).toEqual([])

    await act(async () => {
      view!.rerender(
        <ScopeProvider scope={scope}>
          <ExecutionContextProvider ctx={ctx}>
            <ActionHarness sink={secondSink} />
          </ExecutionContextProvider>
        </ScopeProvider>
      )
    })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Record" }))
      await Promise.resolve()
    })
    expect(firstSink.records).toEqual(["pressed"])
    expect(secondSink.records).toEqual(["pressed"])

    view!.unmount()
    await ctx.close()
    await scope.dispose()
  })
})
