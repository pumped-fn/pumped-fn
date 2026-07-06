# @pumped-fn/ui

Target-neutral TSX authoring for pumped-fn.

Use `@pumped-fn/ui` when UI code should be composed from graph-owned state and actions, then lowered by a
host implementation. The spec is structured: `p.object(...)`, `p.array(...)`, and scalar `p.*` nodes carry
runtime shape for adapters. The `~standard` marker keeps a Standard Schema-style type channel available for
implementation packages without making validation or json-render the foundation.

## Install

```bash
npm install @pumped-fn/ui
```

## Usage

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pumped-fn/ui"
  }
}
```

```tsx
import { p, part, ui } from "@pumped-fn/ui"

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
```

The authored code uses graph handles (`u.state.draft`, `u.action.add`, repeat `todo.id`) instead of path
strings. The output is a `Plan`, and `u.spec` keeps the state/action/view shape for target adapters such as
json-render.

## API

- `p` - structured schema vocabulary for state, actions, props, and events.
- `ui(spec)` - creates the authoring surface from a structured UI spec.
- `part(config)` - view part contract builder.
- `u.state` - state handles.
- `u.action` - action handles.
- `u.view` - component tags and component calls.
- `u.each(collection, child)` - repeat item context.
- `u.slot(name, value)` - named slot placement for TSX children.
- `u.text(template, args)` - template expression.

## License

MIT
