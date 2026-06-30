import { useServerFn } from "@tanstack/react-start"
import type { FormEvent } from "react"
import {
  clearCompletedFn,
  createTodoFn,
  listTodosFn,
  toggleTodoFn,
} from "./functions"
import type { TodoList } from "./domain"

export interface TodoAppProps {
  initial: TodoList
  onChanged(): Promise<void> | void
}

export function TodoApp({ initial, onChanged }: TodoAppProps) {
  const list = useServerFn(listTodosFn)
  const create = useServerFn(createTodoFn)
  const toggle = useServerFn(toggleTodoFn)
  const clear = useServerFn(clearCompletedFn)

  async function refresh() {
    await list()
    await onChanged()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    await create({ data: { title: String(new FormData(form).get("title") ?? "") } })
    form.reset()
    await onChanged()
  }

  async function toggleStatus(id: string) {
    await toggle({ data: { id } })
    await onChanged()
  }

  async function clearDone() {
    await clear()
    await onChanged()
  }

  return (
    <main>
      <header>
        <h1>Todos</h1>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </header>
      <form onSubmit={submit}>
        <input name="title" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {initial.todos.map((todo) => (
          <li key={todo.id}>
            <button type="button" onClick={() => toggleStatus(todo.id)}>
              {todo.status === "open" ? "Complete" : "Reopen"}
            </button>
            <span>{todo.title}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={clearDone}>
        Clear completed
      </button>
    </main>
  )
}
