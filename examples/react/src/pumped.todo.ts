import { derive, provide } from "@pumped-fn/core-next";

export type Todo = {
  id: string;
  content: string;
  completed: boolean;
};

const idGenerator = provide(() => {
  let id = 0;
  return () => {
    id++;
    return id.toString();
  };
});

const todos = provide(() => [] as Todo[]);

const completedTodos = derive([todos.reactive], ([todos]) => {
  return todos.filter((todo) => todo.completed);
});

const selectedTodoId = provide(() => null as string | null);

const setSelectedTodoId = derive([selectedTodoId.static], ([ref]) => {
  return (id: string | null) => {
    ref.update(id);
  };
});

const selectedTodo = derive(
  [selectedTodoId.reactive, todos.reactive],
  ([selectedTodoId, todos]) => {
    const todo = selectedTodoId
      ? todos.find((todo) => todo.id === selectedTodoId)
      : null;
    return todo;
  }
);

const todosController = derive(
  [idGenerator, todos.static],
  ([idGenerator, refTodos]) => {
    return {
      addTodo: (todo: Omit<Todo, "id">) => {
        refTodos.update((todos) => {
          const newTodo = { ...todo, id: idGenerator() };
          return [...todos, newTodo];
        });
      },
      removeTodo: (id: string) => {
        refTodos.update((todos) => {
          return todos.filter((todo) => todo.id !== id);
        });
      },
      toggleComplete: (id: string) => {
        refTodos.update((todos) => {
          return todos.map((todo) => {
            if (todo.id === id) {
              return { ...todo, completed: !todo.completed };
            }
            return todo;
          });
        });
      },
    };
  }
);

export const todoApp = {
  todos,
  todosController,
  selectedTodo,
  setSelectedTodoId,
  completedTodos,
};
