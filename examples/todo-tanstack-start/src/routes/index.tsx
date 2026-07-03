import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import type { FormEvent } from "react"
import {
  clearCompletedFn,
  createTodoFn,
  listTodosFn,
  toggleTodoFn,
} from "../functions"
import type { TodoList } from "../domain"

export const Route = createFileRoute("/")({
  loader: async (): Promise<TodoList> => listTodosFn(),
  component: TodoRoute,
})

function TodoRoute() {
  const router = useRouter()
  const initial: TodoList = Route.useLoaderData()
  const create = useServerFn(createTodoFn)
  const toggle = useServerFn(toggleTodoFn)
  const clear = useServerFn(clearCompletedFn)

  async function refresh() {
    await router.invalidate()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    await create({ data: { title: String(new FormData(form).get("title") ?? "") } })
    form.reset()
    await router.invalidate()
  }

  async function toggleStatus(id: string) {
    await toggle({ data: { id } })
    await router.invalidate()
  }

  async function clearDone() {
    await clear()
    await router.invalidate()
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
