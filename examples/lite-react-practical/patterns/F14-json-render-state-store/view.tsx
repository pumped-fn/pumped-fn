import { defineCatalog } from "@json-render/core"
import { JSONUIProvider, Renderer, defineRegistry, useBoundProp } from "@json-render/react"
import { schema } from "@json-render/react/schema"
import { useResource } from "@pumped-fn/lite-react"
import { scopedValueStateStore } from "@pumped-fn/lite-react-json-render"
import { useMemo } from "react"
import { z } from "zod"
import { orderDraft } from "./after"

const catalog = defineCatalog(schema, {
  components: {
    QuantityField: {
      props: z.object({
        label: z.string(),
        value: z.number(),
      }),
    },
    QuantitySummary: {
      props: z.object({
        item: z.string(),
        quantity: z.number(),
      }),
    },
  },
  actions: {},
})

const { registry } = defineRegistry(catalog, {
  components: {
    QuantityField: ({ props, bindings, children }) => {
      const [value, setValue] = useBoundProp<number>(props.value, bindings?.["value"])
      return (
        <label>
          {props.label}
          <input
            aria-label={props.label}
            type="number"
            min={1}
            value={value}
            onChange={(event) => setValue(event.currentTarget.valueAsNumber)}
          />
          {children}
        </label>
      )
    },
    QuantitySummary: ({ props }) => (
      <output aria-label="order summary">
        {props.item}: {props.quantity}
      </output>
    ),
  },
})

const spec = {
  root: "quantity",
  elements: {
    quantity: {
      type: "QuantityField",
      props: {
        label: "Quantity",
        value: { $bindState: "/order/quantity" },
      },
      children: ["summary"],
    },
    summary: {
      type: "QuantitySummary",
      props: {
        item: { $state: "/order/item" },
        quantity: { $state: "/order/quantity" },
      },
      children: [],
    },
  },
}

export function JsonRenderOrder() {
  const draft = useResource(orderDraft, { suspense: false })
  const store = useMemo(() => (
    draft.status === "ready" ? scopedValueStateStore({ value: draft.data }) : undefined
  ), [draft.status, draft.data])

  if (!store) return null

  return (
    <JSONUIProvider registry={registry} store={store}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  )
}
