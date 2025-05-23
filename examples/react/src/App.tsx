import { Suspense } from "react";
import { Reactives, ScopeProvider, useResolves } from "@pumped-fn/react";

import { Todo, todoApp } from "./pumped.todo";
import { counterApp } from "./pumped.counter";
import { TestApp } from "./Proxied";

function TodoList() {
  const [setSelectedTodoId, controller] = useResolves(
    todoApp.setSelectedTodoId,
    todoApp.todosController
  );

  return (
    <>
      <h1>Todo list</h1>
      <Reactives e={[todoApp.todos]}>
        {([todos]) =>
          todos.map((todo) => (
            <div key={todo.id} onClick={() => setSelectedTodoId(todo.id)}>
              {todo.content}-
              <button onClick={() => controller.removeTodo(todo.id)}>
                Remove
              </button>
            </div>
          ))
        }
      </Reactives>

      <Reactives e={[todoApp.selectedTodo]}>
        {([todo]) =>
          todo ? (
            <>
              <h1>{todo.content}</h1>
              <label>
                Mark as completed:
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => controller.toggleComplete(todo.id)}
                />
              </label>
              <button onClick={() => setSelectedTodoId(null)}>Close</button>
            </>
          ) : null
        }
      </Reactives>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const content = e.currentTarget.content.value;
          const completed = e.currentTarget.completed.checked;

          controller.addTodo({ content, completed });
          e.currentTarget.reset();
        }}
      >
        <input type="text" name="content" />
        <input type="checkbox" name="completed" />
        <button type="submit">Add todo</button>
      </form>

      <Reactives e={[todoApp.completedTodos]}>
        {([todos]) => (
          <>
            <h1>Completed todos {todos.length}</h1>
            {todos.map((todo) => (
              <div key={todo.id}>{todo.content}</div>
            ))}
          </>
        )}
      </Reactives>
    </>
  );
}

export default function AppWrapper() {
  return (
    <ScopeProvider>
      <Suspense>
        <TodoList />
        <hr />

        <TestApp />
      </Suspense>
    </ScopeProvider>
  );
}
