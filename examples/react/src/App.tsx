import { Suspense } from "react";
import { pumped, ScopeProvider, useResolveMany } from "@pumped-fn/react";

import { Todo, todoApp } from "./pumped.todo";
import { counterApp } from "./pumped.counter";

function TodoList() {
  const [setSelectedTodoId, controller] = useResolveMany(
    todoApp.setSelectedTodoId,
    todoApp.todosController
  );

  return (
    <>
      <h1>Todo list</h1>
      <pumped.Reactives e={[todoApp.todos]}>
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
      </pumped.Reactives>

      <pumped.Reactives e={[todoApp.selectedTodo]}>
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
      </pumped.Reactives>

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

      <pumped.Reselect
        e={todoApp.todos}
        selector={(todos) => todos.filter((todo) => todo.completed)}
        equality={compareTodo}
      >
        {(todos) => (
          <>
            <h1>Completed todos {todos.length}</h1>
            {todos.map((todo) => (
              <div key={todo.id}>{todo.content}</div>
            ))}
          </>
        )}
      </pumped.Reselect>
    </>
  );
}

function compareTodo(_prev: unknown, _next: unknown): boolean {
  const prev = _prev as Todo[];
  const next = _next as Todo[];

  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id) return false;
    if (prev[i].content !== next[i].content) return false;
    if (prev[i].completed !== next[i].completed) return false;
  }

  return true;
}

const Counter = () => (
  <>
    <pumped.Effect e={[counterApp.timer]} />
    <pumped.Reactives e={[counterApp.counter]}>
      {([count]) => <h1>Counter: {count}</h1>}
    </pumped.Reactives>

    <pumped.Resolve e={counterApp.configController}>
      {(configController) => (
        <>
          <button onClick={() => configController.changeIncrement(1)}>
            Increment
          </button>
          <button onClick={() => configController.changeInterval(-1)}>
            Faster
          </button>
          <button onClick={() => configController.changeInterval(1)}>
            Slower
          </button>
        </>
      )}
    </pumped.Resolve>
  </>
);

export default function AppWrapper() {
  return (
    <ScopeProvider>
      <Suspense>
        <TodoList />
        <hr />
        <Counter />
      </Suspense>
    </ScopeProvider>
  );
}
