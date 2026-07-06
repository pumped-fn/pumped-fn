import { describe, expect, test } from "vitest"
import { p, part, ui } from "../src"

const todo = p.object({
  id: p.string,
  title: p.string,
  detail: p.nullableString,
  done: p.boolean,
  tone: p.string,
})

const u = ui({
  state: p.object({
    draft: p.string,
    headline: p.string,
    open: p.number,
    done: p.number,
    items: p.array(todo),
  }),
  action: {
    draft: p.object({ text: p.string }),
    add: p.object({ text: p.string }),
    toggle: p.object({ id: p.string }),
    clear: p.object({}),
  },
  view: {
    Board: part({
      props: {
        title: p.string,
        open: p.number,
        done: p.number,
      },
      slots: ["default"],
    }),
    Composer: part({
      props: {
        value: p.string,
        placeholder: p.string,
      },
      on: {
        change: p.object({ value: p.string }),
        submit: p.object({}),
      },
    }),
    Lane: part({
      props: {
        title: p.string,
        items: p.array(todo),
      },
      slots: ["rows"],
    }),
    Todo: part({
      props: {
        title: p.string,
        detail: p.nullableString,
        done: p.boolean,
        tone: p.string,
      },
      on: {
        toggle: p.object({}),
      },
    }),
    Toolbar: part({
      props: {
        label: p.string,
      },
      on: {
        clear: p.object({}),
      },
    }),
  },
})

const plan = u.plan(
  <u.view.Board title={u.state.headline} open={u.state.open} done={u.state.done}>
    <u.view.Composer
      value={u.state.draft}
      placeholder="Add a crisp next action"
      onChange={(event) => u.action.draft({ text: event.value })}
      onSubmit={u.action.add({ text: u.state.draft })}
    />
    <u.view.Lane title="Today" items={u.state.items}>
      {u.slot(
        "rows",
        u.each(u.state.items, (todo) => (
          <u.view.Todo
            title={todo.title}
            detail={todo.detail}
            done={todo.done}
            tone={todo.tone}
            onToggle={u.action.toggle({ id: todo.id })}
          />
        ))
      )}
    </u.view.Lane>
    <u.view.Toolbar label="Clear completed" onClear={u.action.clear({})} />
  </u.view.Board>
)

describe("tsx", () => {
  test("authors a target-neutral plan from structured JSX", () => {
    expect(plan).toEqual({
      root: {
        kind: "node",
        type: "Board",
        props: {
          title: { kind: "state", path: ["headline"] },
          open: { kind: "state", path: ["open"] },
          done: { kind: "state", path: ["done"] },
        },
        slots: {
          default: [
            {
              kind: "node",
              type: "Composer",
              props: {
                value: { kind: "state", path: ["draft"] },
                placeholder: "Add a crisp next action",
              },
              on: {
                change: { name: "draft", input: { text: { kind: "event", path: ["value"] } } },
                submit: { name: "add", input: { text: { kind: "state", path: ["draft"] } } },
              },
            },
            {
              kind: "node",
              type: "Lane",
              props: {
                title: "Today",
                items: { kind: "state", path: ["items"] },
              },
              slots: {
                rows: [
                  {
                    kind: "each",
                    source: { kind: "state", path: ["items"] },
                    nodes: [
                      {
                        kind: "node",
                        type: "Todo",
                        props: {
                          title: { kind: "item", path: ["title"] },
                          detail: { kind: "item", path: ["detail"] },
                          done: { kind: "item", path: ["done"] },
                          tone: { kind: "item", path: ["tone"] },
                        },
                        on: {
                          toggle: { name: "toggle", input: { id: { kind: "item", path: ["id"] } } },
                        },
                      },
                    ],
                  },
                ],
              },
            },
            {
              kind: "node",
              type: "Toolbar",
              props: { label: "Clear completed" },
              on: {
                clear: { name: "clear", input: {} },
              },
            },
          ],
        },
      },
    })
    expect(u.spec.state).toEqual({
      "~standard": { version: 1, vendor: "@pumped-fn/ui" },
      node: "object",
      fields: {
        draft: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "string" },
        headline: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "string" },
        open: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "number" },
        done: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "number" },
        items: {
          "~standard": { version: 1, vendor: "@pumped-fn/ui" },
          node: "array",
          item: todo,
        },
      },
    })
    expect(u.spec.view.Todo).toEqual({
      props: {
        title: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "string" },
        detail: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "nullableString" },
        done: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "boolean" },
        tone: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "leaf", kind: "string" },
      },
      on: {
        toggle: { "~standard": { version: 1, vendor: "@pumped-fn/ui" }, node: "object", fields: {} },
      },
    })
  })
})
