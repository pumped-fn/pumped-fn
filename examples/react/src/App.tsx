import { Suspense, useMemo } from "react";
import { ScopeProvider, useResolve, useResolveMany } from "@pumped-fn/react";

import { Todo, todoApp } from "./todo.pumped";
import { counterApp } from "./counter.pumped";

function TodoList() {
  const [todos, setSeletectedTodoId, controller] = useResolveMany(
    todoApp.todos,
    todoApp.setSelectedTodoId,
    todoApp.todosController,
  );

  return (
    <>
      <h1>Todo list</h1>
      {todos.map((todo) => (
        <div key={todo.id} onClick={() => setSeletectedTodoId(todo.id)}>
          {todo.content}-<button onClick={() => controller.removeTodo(todo.id)}>Remove</button>
        </div>
      ))}
    </>
  );
}

function TodoDetail() {
  const [todo, setSelectedTodoId, controller] = useResolveMany(
    todoApp.selectedTodo,
    todoApp.setSelectedTodoId,
    todoApp.todosController,
  );

  if (!todo) return null;

  return (
    <>
      <h1>{todo.content}</h1>
      <label>
        Mark as completed:
        <input type="checkbox" checked={todo.completed} onChange={() => controller.toggleComplete(todo.id)} />
      </label>
      <button onClick={() => setSelectedTodoId(null)}>Close</button>
    </>
  );
}

function TodoForm() {
  const controller = useResolve(todoApp.todosController);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const content = e.currentTarget.content.value;
          controller.addTodo({ content, completed: false });
          e.currentTarget.reset();
        }}
      >
        <input type="text" name="content" />
        <button type="submit">Add todo</button>
      </form>
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

function CompletedTodoList() {
  const todos = useResolve(
    todoApp.todos,
    useMemo(() => (todos) => todos.filter((todo) => todo.completed), []),
    {
      equality: compareTodo,
    },
  );

  return (
    <>
      <h1>Completed todos {todos.length}</h1>
      {todos.map((todo) => (
        <div key={todo.id}>{todo.content}</div>
      ))}
    </>
  );
}

const Counter = () => {
  const [counter, configController] = useResolveMany(
    counterApp.counter,
    counterApp.configController,
    counterApp.timer,
    counterApp.config
  )

  return <>
  <h1>{counter}</h1>
  <button onClick={() => configController.changeIncrement(1)}>Increment</button>
  <button onClick={() => configController.changeInterval(-1)}>Faster</button>
  <button onClick={() => configController.changeInterval(1)}>Slower</button>
  </>;
}


export default function AppWrapper() {
  return (
    <ScopeProvider>
      <Suspense>
        <TodoDetail />
        <TodoList />
        <TodoForm />
      </Suspense>
      <Suspense>
        <CompletedTodoList />
      </Suspense>
      <Suspense>
        <Counter />
      </Suspense>
    </ScopeProvider>
  );
}
