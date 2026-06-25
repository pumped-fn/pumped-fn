import { defineCatalog } from "@json-render/core"
import { JSONUIProvider, Renderer, defineRegistry, useBoundProp } from "@json-render/react"
import { schema } from "@json-render/react/schema"
import { useResource } from "@pumped-fn/lite-react"
import type { ScopedValueAccess } from "@pumped-fn/lite-react"
import { flowAction, scopedValueStateStore, useFlowHandlers } from "@pumped-fn/lite-react-json-render"
import { useMemo } from "react"
import { z } from "zod"
import { currentOrderDraft, type OrderState, orderDraft, submitOrder } from "./after"

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
    SubmitButton: {
      props: z.object({
        label: z.string(),
      }),
    },
    SubmissionStatus: {
      props: z.object({
        message: z.string().optional(),
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
    SubmitButton: ({ props, emit }) => (
      <button type="button" onClick={() => emit("press")}>
        {props.label}
      </button>
    ),
    SubmissionStatus: ({ props }) => (
      <output aria-label="submission status">
        {props.message ?? "Not submitted"}
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
      children: ["summary", "submit", "submitted"],
    },
    summary: {
      type: "QuantitySummary",
      props: {
        item: { $state: "/order/item" },
        quantity: { $state: "/order/quantity" },
      },
      children: [],
    },
    submit: {
      type: "SubmitButton",
      props: {
        label: "Submit order",
      },
      on: {
        press: {
          action: "submitOrder",
          params: {
            item: { $state: "/order/item" },
            quantity: { $state: "/order/quantity" },
          },
        },
      },
      children: [],
    },
    submitted: {
      type: "SubmissionStatus",
      props: {
        message: { $state: "/submission/message" },
      },
      children: [],
    },
  },
}

export function JsonRenderOrder() {
  const draft = useResource(orderDraft, { suspense: false })

  if (draft.status !== "ready") return null

  return <OrderBridge draft={draft.data} />
}

function OrderBridge({ draft }: { draft: ScopedValueAccess<OrderState> }) {
  const store = useMemo(() => scopedValueStateStore({ value: draft }), [draft])
  const actions = useMemo(() => ({
    submitOrder: flowAction({
      flow: submitOrder,
      tags: [currentOrderDraft(draft)],
    }),
  }), [draft])
  const handlers = useFlowHandlers(actions)

  return (
    <JSONUIProvider registry={registry} store={store} handlers={handlers}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  )
}
