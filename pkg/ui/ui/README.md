# @pumped-fn/ui

Graph-handle UI authoring for pumped-fn.

Use `@pumped-fn/ui` when the UI should be composed from graph-owned state and flows, then serialized to a
portable render contract. The package does not replace React, Vue, React Native, or json-render. It authors a
checked plan that host implementations can render, while json-render remains a serialization target.

## Install

```bash
npm install @pumped-fn/ui @pumped-fn/lite-render-core
```

## Usage

```ts
import { ui } from "@pumped-fn/ui"

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
                props: { text: todo.text, done: todo.done },
                on: { toggle: u.action.toggleTodo({ id: todo.id }) },
              })
            ),
          },
        }),
      ],
    },
  })
)

render.verify(spec)
```

The authored code uses handles (`u.state.draft`, `u.action.addTodo`, repeat `todo.id`) instead of path strings.
The output is still a `JsonSpec` for the existing render verifier.

## API

- `ui(contract)` - creates the authoring surface for a `defineRender(...)` contract.
- `u.state` - schema-derived state handles.
- `u.action` - action-registry handles.
- `u.node` - catalog component calls.
- `u.each(collection, child)` - repeat item context.
- `u.text(template, args)` - template expression.

## License

MIT
