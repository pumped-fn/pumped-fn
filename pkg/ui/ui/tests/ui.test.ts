import { describe, expect, test } from "vitest"
import { flow, resource, typed } from "@pumped-fn/lite"
import { action, defineRender, k, type Infer } from "@pumped-fn/lite-render-core"
import { ui } from "../src"

const todo = k.object({
  id: k.string,
  text: k.string,
  done: k.boolean,
})

const schema = k.object({
  draft: k.string,
  items: k.array(todo),
})

const store = resource({
  name: "todo-store",
  factory: () => ({
    get: () => ({
      draft: "",
      items: [{ id: "t1", text: "Draft ui", done: false }],
    }),
  }),
})

const setDraftInput = k.object({ text: k.string })
const addTodoInput = k.object({ text: k.string })
const toggleInput = k.object({ id: k.string })

const setDraft = flow({
  name: "set-draft",
  parse: typed<Infer<typeof setDraftInput>>(),
  factory: (ctx) => ctx.input.text,
})

const addTodo = flow({
  name: "add-todo",
  parse: typed<Infer<typeof addTodoInput>>(),
  factory: (ctx) => ctx.input.text,
})

const toggle = flow({
  name: "toggle",
  parse: typed<Infer<typeof toggleInput>>(),
  factory: (ctx) => ctx.input.id,
})

const render = defineRender({
  schema,
  state: store,
  catalog: {
    TodoApp: {
      props: {},
      slots: { default: true },
      events: {},
      capabilities: ["layout.app"],
    },
    TodoInput: {
      props: { value: k.string },
      slots: {},
      events: {
        change: { value: "string" },
        submit: {},
      },
      capabilities: ["control.text-input"],
    },
    TodoList: {
      props: { items: k.array(todo) },
      slots: { rows: { repeats: "items" } },
      events: {},
      capabilities: ["layout.list"],
    },
    TodoRow: {
      props: {
        text: k.string,
        done: k.boolean,
      },
      slots: {},
      events: { toggle: {} },
      capabilities: ["surface.todo-row"],
    },
  },
  actions: {
    setDraft: action(setDraft, setDraftInput),
    addTodo: action(addTodo, addTodoInput),
    toggle: action(toggle, toggleInput),
  },
})

const u = ui(render)

const spec = u.spec(
  u.node.TodoApp({
    props: {},
    slots: {
      default: [
        u.node.TodoInput({
          props: { value: u.state.draft },
          on: {
            change: (event) => u.action.setDraft({ text: event.value }),
            submit: u.action.addTodo({ text: u.state.draft }),
          },
        }),
        u.node.TodoList({
          props: { items: u.state.items },
          slots: {
            rows: u.each(u.state.items, (todo) =>
              u.node.TodoRow({
                props: {
                  text: todo.text,
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
  test("authors a render spec from graph handles", () => {
    expect(spec).toEqual({
      root: {
        type: "TodoApp",
        props: {},
        slots: {
          default: [
            {
              type: "TodoInput",
              props: { value: { state: "/draft" } },
              on: {
                change: { flow: "setDraft", params: { text: { event: "value" } } },
                submit: { flow: "addTodo", params: { text: { state: "/draft" } } },
              },
            },
            {
              type: "TodoList",
              props: { items: { state: "/items" } },
              slots: {
                rows: [
                  {
                    type: "TodoRow",
                    props: {
                      text: { item: "text" },
                      done: { item: "done" },
                    },
                    on: {
                      toggle: { flow: "toggle", params: { id: { item: "id" } } },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    })
    expect(render.verify(spec)).toEqual({ ok: true, spec })
  })
})
