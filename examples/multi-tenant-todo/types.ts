export namespace Todo {
  export type Item = {
    id: string
    title: string
    completed: boolean
    createdAt: number
  }

  export type State = {
    tenantId: string
    todos: Map<string, Item>
  }
}

export namespace TenantMessage {
  export type CreateTodo = {
    type: 'CREATE_TODO'
    payload: { id: string; title: string }
  }

  export type UpdateTodo = {
    type: 'UPDATE_TODO'
    payload: { id: string; title?: string; completed?: boolean }
  }

  export type DeleteTodo = {
    type: 'DELETE_TODO'
    payload: { id: string }
  }

  export type GetTodos = {
    type: 'GET_TODOS'
    payload: Record<string, never>
  }

  export type Message = CreateTodo | UpdateTodo | DeleteTodo | GetTodos
}
