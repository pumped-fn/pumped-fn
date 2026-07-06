import { describe, expect, test } from "vitest"
import { p, part, ui } from "../src"

const todo = p.object({
  id: p.string,
  title: p.string,
  done: p.boolean,
})

const u = ui({
  state: p.object({
    draft: p.string,
    items: p.array(todo),
  }),
  action: {
    draft: p.object({ text: p.string }),
    add: p.object({ text: p.string }),
    toggle: p.object({ id: p.string }),
  },
  view: {
    App: part({ slots: ["default"] }),
    Input: part({
      props: { value: p.string },
      on: {
        change: p.object({ value: p.string }),
        submit: p.object({}),
      },
    }),
    List: part({
      props: { items: p.array(todo) },
      slots: ["rows"],
    }),
    Row: part({
      props: {
        title: p.string,
        done: p.boolean,
      },
      on: { toggle: p.object({}) },
    }),
  },
})

const plan = u.plan(
  u.view.App({
    props: {},
    slots: {
      default: [
        u.view.Input({
          props: { value: u.state.draft },
          on: {
            change: (event) => u.action.draft({ text: event.value }),
            submit: u.action.add({ text: u.state.draft }),
          },
        }),
        u.view.List({
          props: { items: u.state.items },
          slots: {
            rows: u.each(u.state.items, (todo) =>
              u.view.Row({
                props: {
                  title: todo.title,
                  done: todo.done,
                },
                on: {
                  toggle: u.action.toggle({ id: todo.id }),
                },
              })
            ),
          },
        }),
      ],
    },
  })
)

describe("ui", () => {
  test("authors a target-neutral plan from structured graph handles", () => {
    expect(plan).toEqual({
      root: {
        kind: "node",
        type: "App",
        props: {},
        slots: {
          default: [
            {
              kind: "node",
              type: "Input",
              props: { value: { kind: "state", path: ["draft"] } },
              on: {
                change: { name: "draft", input: { text: { kind: "event", path: ["value"] } } },
                submit: { name: "add", input: { text: { kind: "state", path: ["draft"] } } },
              },
            },
            {
              kind: "node",
              type: "List",
              props: { items: { kind: "state", path: ["items"] } },
              slots: {
                rows: [
                  {
                    kind: "each",
                    source: { kind: "state", path: ["items"] },
                    nodes: [
                      {
                        kind: "node",
                        type: "Row",
                        props: {
                          title: { kind: "item", path: ["title"] },
                          done: { kind: "item", path: ["done"] },
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
          ],
        },
      },
    })
  })

  test("rejects slash field keys", () => {
    const field = "bad/key" as string
    expect(() => p.object({ [field]: p.string })).toThrow('schema field "bad/key" cannot contain "/"')
  })
})
