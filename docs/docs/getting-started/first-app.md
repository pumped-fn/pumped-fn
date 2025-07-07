# Your First App

Let's build a complete todo application to demonstrate more advanced Pumped Fn concepts. This will show you how to handle complex state interactions, form handling, and list management.

## Application Structure

Our todo app will have:
- A list of todos with add/remove functionality
- Todo completion toggle
- Selected todo detail view
- Filtered views (completed todos)

## Step 1: Define Types

First, let's define our data types:

```typescript
export type Todo = {
  id: string;
  content: string;
  completed: boolean;
};
```

## Step 2: Create Base State

Let's create our core state executors:

```typescript
import { provide, derive } from '@pumped-fn/core-next';

// ID generator for new todos
const idGenerator = provide(() => {
  let id = 0;
  return () => {
    id++;
    return id.toString();
  };
});

// Main todos list
const todos = provide(() => [] as Todo[]);

// Currently selected todo ID
const selectedTodoId = provide(() => null as string | null);
```

## Step 3: Create Derived State

Now let's create computed state that depends on our base state:

```typescript
// Computed: completed todos
const completedTodos = derive([todos.reactive], ([todos]) => {
  return todos.filter((todo) => todo.completed);
});

// Computed: currently selected todo
const selectedTodo = derive(
  [selectedTodoId.reactive, todos.reactive],
  ([selectedTodoId, todos]) => {
    return selectedTodoId 
      ? todos.find((todo) => todo.id === selectedTodoId) ?? null
      : null;
  }
);
```

## Step 4: Create Action Creators

Let's create executors that return action functions:

```typescript
// Action: set selected todo ID
const setSelectedTodoId = derive([selectedTodoId.static], ([ref]) => {
  return (id: string | null) => {
    ref.update(id);
  };
});

// Action: todo operations
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
```

## Step 5: Create React Components

Now let's build our React components:

```tsx
import React from 'react';
import { useResolves } from '@pumped-fn/react';

function TodoList() {
  const [todos, setSelectedTodoId, controller] = useResolves(
    todos,
    setSelectedTodoId,
    todosController
  );

  return (
    <div>
      <h2>Todo List</h2>
      {todos.map((todo) => (
        <div key={todo.id} style={{ 
          padding: '10px', 
          border: '1px solid #ccc', 
          margin: '5px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span
            onClick={() => setSelectedTodoId(todo.id)}
            style={{ 
              textDecoration: todo.completed ? 'line-through' : 'none',
              cursor: 'pointer',
              flex: 1
            }}
          >
            {todo.content}
          </span>
          <button onClick={() => controller.removeTodo(todo.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function TodoForm() {
  const [controller] = useResolves(todosController);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const content = formData.get('content') as string;
    const completed = formData.get('completed') === 'on';

    if (content.trim()) {
      controller.addTodo({ content: content.trim(), completed });
      e.currentTarget.reset();
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          name="content"
          placeholder="What needs to be done?"
          style={{ padding: '8px', marginRight: '10px' }}
        />
        <label>
          <input type="checkbox" name="completed" />
          {' '}Already completed
        </label>
      </div>
      <button type="submit">Add Todo</button>
    </form>
  );
}

function TodoDetail() {
  const [selectedTodo, setSelectedTodoId, controller] = useResolves(
    selectedTodo,
    setSelectedTodoId,
    todosController
  );

  if (!selectedTodo) return null;

  return (
    <div style={{ 
      padding: '20px', 
      border: '2px solid #007bff', 
      borderRadius: '8px',
      marginTop: '20px'
    }}>
      <h3>{selectedTodo.content}</h3>
      <label style={{ display: 'block', marginBottom: '10px' }}>
        <input
          type="checkbox"
          checked={selectedTodo.completed}
          onChange={() => controller.toggleComplete(selectedTodo.id)}
        />
        {' '}Mark as completed
      </label>
      <button onClick={() => setSelectedTodoId(null)}>
        Close
      </button>
    </div>
  );
}

function CompletedTodos() {
  const [completed] = useResolves(completedTodos);

  return (
    <div style={{ marginTop: '20px' }}>
      <h3>Completed Todos ({completed.length})</h3>
      {completed.map((todo) => (
        <div key={todo.id} style={{ padding: '5px 0' }}>
          ✓ {todo.content}
        </div>
      ))}
    </div>
  );
}
```

## Step 6: Complete Application

Let's put it all together:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// Types
const Todo = {};

// State
const idGenerator = provide(() => {
  let id = 0;
  return () => {
    id++;
    return id.toString();
  };
});

const todos = provide(() => []);
const selectedTodoId = provide(() => null);

// Derived State
const completedTodos = derive([todos.reactive], ([todos]) => {
  return todos.filter((todo) => todo.completed);
});

const selectedTodo = derive(
  [selectedTodoId.reactive, todos.reactive],
  ([selectedTodoId, todos]) => {
    return selectedTodoId 
      ? todos.find((todo) => todo.id === selectedTodoId) ?? null
      : null;
  }
);

// Actions
const setSelectedTodoId = derive([selectedTodoId.static], ([ref]) => {
  return (id) => ref.update(id);
});

const todosController = derive(
  [idGenerator, todos.static],
  ([idGenerator, refTodos]) => {
    return {
      addTodo: (todo) => {
        refTodos.update((todos) => {
          const newTodo = { ...todo, id: idGenerator() };
          return [...todos, newTodo];
        });
      },
      removeTodo: (id) => {
        refTodos.update((todos) => todos.filter((todo) => todo.id !== id));
      },
      toggleComplete: (id) => {
        refTodos.update((todos) => 
          todos.map((todo) => 
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
          )
        );
      },
    };
  }
);

// Components
function TodoApp() {
  const [todosList, setSelected, controller, completed, selected] = useResolves(
    todos, setSelectedTodoId, todosController, completedTodos, selectedTodo
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const content = formData.get('content');
    const isCompleted = formData.get('completed') === 'on';

    if (content?.trim()) {
      controller.addTodo({ content: content.trim(), completed: isCompleted });
      e.currentTarget.reset();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Todo App</h1>
      
      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            name="content"
            placeholder="What needs to be done?"
            style={{ padding: '8px', marginRight: '10px', width: '300px' }}
          />
          <label>
            <input type="checkbox" name="completed" />
            {' '}Already completed
          </label>
        </div>
        <button type="submit">Add Todo</button>
      </form>

      <div>
        <h2>Todos ({todosList.length})</h2>
        {todosList.map((todo) => (
          <div key={todo.id} style={{ 
            padding: '10px', 
            border: '1px solid #ccc', 
            margin: '5px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span
              onClick={() => setSelected(todo.id)}
              style={{ 
                textDecoration: todo.completed ? 'line-through' : 'none',
                cursor: 'pointer',
                flex: 1
              }}
            >
              {todo.content}
            </span>
            <button onClick={() => controller.removeTodo(todo.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ 
          padding: '20px', 
          border: '2px solid #007bff', 
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <h3>{selected.content}</h3>
          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input
              type="checkbox"
              checked={selected.completed}
              onChange={() => controller.toggleComplete(selected.id)}
            />
            {' '}Mark as completed
          </label>
          <button onClick={() => setSelected(null)}>
            Close
          </button>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <h3>Completed Todos ({completed.length})</h3>
        {completed.map((todo) => (
          <div key={todo.id} style={{ padding: '5px 0' }}>
            ✓ {todo.content}
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  return (
    <ScopeProvider>
      <TodoApp />
    </ScopeProvider>
  );
}

export default App;
```

## Key Patterns Demonstrated

1. **Complex State Management**: Multiple interdependent state pieces
2. **Derived State**: Computed values that update automatically
3. **Action Creators**: Functions that encapsulate state updates
4. **Form Handling**: Integration with React forms
5. **Conditional Rendering**: Components that show/hide based on state
6. **List Management**: Adding, removing, and updating list items

## Next Steps

Now that you've built a complete application, dive deeper into:
- [Core Concepts](../core-concepts/executors.md) - Understanding executors in detail
- [React Integration](../react/overview.md) - Advanced React patterns
- [Examples](../examples/counter.md) - More complex examples