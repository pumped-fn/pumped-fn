# Testing React Components

This guide covers testing React components that use Pumped Fn state management, including hooks, components, and complex interactions.

## Setup for React Testing

### Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

```typescript
// tests/setup.ts
import "@testing-library/jest-dom";

// Optional: Suppress React development warnings in tests
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("useEffect")) {
    return;
  }
  originalError.call(console, ...args);
};
```

### Dependencies

```json
{
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "vitest": "^1.0.0",
    "jsdom": "^23.0.0"
  }
}
```

## Testing Hooks

### Basic Hook Testing

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { provide, derive, createScope } from "@pumped-fn/core-next";
import { useResolves, ScopeProvider } from "@pumped-fn/react";

test("useResolves basic usage", async () => {
  const counter = provide(() => 0);
  const doubled = derive([counter.reactive], ([count]) => count * 2);
  
  const { result } = renderHook(
    () => useResolves(counter, doubled),
    {
      wrapper: ({ children }) => (
        <ScopeProvider>
          {children}
        </ScopeProvider>
      ),
    }
  );
  
  await waitFor(() => {
    expect(result.current[0]).toBe(0); // counter
    expect(result.current[1]).toBe(0); // doubled
  });
});

test("useResolves with updates", async () => {
  const counter = provide(() => 0);
  const scope = createScope();
  
  const { result } = renderHook(
    () => useResolves(counter),
    {
      wrapper: ({ children }) => (
        <ScopeProvider scope={scope}>
          {children}
        </ScopeProvider>
      ),
    }
  );
  
  // Initial value
  await waitFor(() => {
    expect(result.current[0]).toBe(0);
  });
  
  // Update externally
  await scope.update(counter, 5);
  
  await waitFor(() => {
    expect(result.current[0]).toBe(5);
  });
});
```

### Testing Multiple Hooks

```tsx
test("multiple hooks working together", async () => {
  const count = provide(() => 0);
  const doubled = derive([count.reactive], ([c]) => c * 2);
  const tripled = derive([count.reactive], ([c]) => c * 3);
  
  const { result } = renderHook(
    () => {
      const [countValue] = useResolves(count);
      const [doubledValue] = useResolves(doubled);
      const [tripledValue] = useResolves(tripled);
      
      return { countValue, doubledValue, tripledValue };
    },
    {
      wrapper: ({ children }) => <ScopeProvider>{children}</ScopeProvider>,
    }
  );
  
  await waitFor(() => {
    expect(result.current.countValue).toBe(0);
    expect(result.current.doubledValue).toBe(0);
    expect(result.current.tripledValue).toBe(0);
  });
});
```

### Testing useResolve with Selectors

```tsx
test("useResolve with selector", async () => {
  const user = provide(() => ({
    id: 1,
    name: "John",
    email: "john@example.com",
    settings: { theme: "dark" }
  }));
  
  const { result } = renderHook(
    () => {
      const name = useResolve(user, (u) => u.name);
      const theme = useResolve(user, (u) => u.settings.theme);
      return { name, theme };
    },
    {
      wrapper: ({ children }) => <ScopeProvider>{children}</ScopeProvider>,
    }
  );
  
  await waitFor(() => {
    expect(result.current.name).toBe("John");
    expect(result.current.theme).toBe("dark");
  });
});
```

## Testing Components

### Basic Component Testing

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { provide, derive } from "@pumped-fn/core-next";
import { useResolves, ScopeProvider } from "@pumped-fn/react";

// Test component
const counter = provide(() => 0);
const doubled = derive([counter.reactive], ([count]) => count * 2);

function Counter() {
  const [count, doubledValue] = useResolves(counter, doubled);
  
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="doubled">{doubledValue}</span>
      <button 
        data-testid="increment"
        onClick={() => counter.update(c => c + 1)}
      >
        Increment
      </button>
    </div>
  );
}

test("counter component renders and updates", async () => {
  render(
    <ScopeProvider>
      <Counter />
    </ScopeProvider>
  );
  
  // Initial state
  expect(screen.getByTestId("count")).toHaveTextContent("0");
  expect(screen.getByTestId("doubled")).toHaveTextContent("0");
  
  // Click increment
  fireEvent.click(screen.getByTestId("increment"));
  
  // Wait for updates
  await waitFor(() => {
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("doubled")).toHaveTextContent("2");
  });
});
```

### Testing Form Components

```tsx
const formData = provide(() => ({ name: "", email: "" }));
const isValid = derive([formData.reactive], ([data]) => 
  data.name.length > 0 && data.email.includes("@")
);

function UserForm() {
  const [data, valid] = useResolves(formData, isValid);
  
  const updateField = (field: string) => (value: string) => {
    formData.update(current => ({ ...current, [field]: value }));
  };
  
  return (
    <form>
      <input
        data-testid="name"
        value={data.name}
        onChange={(e) => updateField("name")(e.target.value)}
        placeholder="Name"
      />
      <input
        data-testid="email"
        value={data.email}
        onChange={(e) => updateField("email")(e.target.value)}
        placeholder="Email"
      />
      <button 
        data-testid="submit"
        type="submit" 
        disabled={!valid}
      >
        Submit
      </button>
    </form>
  );
}

test("form validation", async () => {
  const user = userEvent.setup();
  
  render(
    <ScopeProvider>
      <UserForm />
    </ScopeProvider>
  );
  
  const submitButton = screen.getByTestId("submit");
  expect(submitButton).toBeDisabled();
  
  // Fill name
  await user.type(screen.getByTestId("name"), "John Doe");
  expect(submitButton).toBeDisabled(); // Still invalid
  
  // Fill email
  await user.type(screen.getByTestId("email"), "john@example.com");
  
  await waitFor(() => {
    expect(submitButton).toBeEnabled();
  });
});
```

### Testing List Components

```tsx
const todos = provide(() => [] as Array<{ id: string; text: string; done: boolean }>);

const todosController = derive([todos.static], ([todosRef]) => ({
  add: (text: string) => {
    todosRef.update(list => [...list, {
      id: Date.now().toString(),
      text,
      done: false
    }]);
  },
  toggle: (id: string) => {
    todosRef.update(list => 
      list.map(todo => 
        todo.id === id ? { ...todo, done: !todo.done } : todo
      )
    );
  },
  remove: (id: string) => {
    todosRef.update(list => list.filter(todo => todo.id !== id));
  }
}));

function TodoList() {
  const [todoList, controller] = useResolves(todos, todosController);
  
  return (
    <div>
      <ul data-testid="todo-list">
        {todoList.map(todo => (
          <li key={todo.id} data-testid={`todo-${todo.id}`}>
            <span style={{ textDecoration: todo.done ? "line-through" : "none" }}>
              {todo.text}
            </span>
            <button onClick={() => controller.toggle(todo.id)}>
              Toggle
            </button>
            <button onClick={() => controller.remove(todo.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button 
        data-testid="add-todo"
        onClick={() => controller.add("New Todo")}
      >
        Add Todo
      </button>
    </div>
  );
}

test("todo list operations", async () => {
  render(
    <ScopeProvider>
      <TodoList />
    </ScopeProvider>
  );
  
  // Initially empty
  expect(screen.getByTestId("todo-list")).toBeEmptyDOMElement();
  
  // Add todo
  fireEvent.click(screen.getByTestId("add-todo"));
  
  await waitFor(() => {
    expect(screen.getByText("New Todo")).toBeInTheDocument();
  });
  
  // Toggle todo
  fireEvent.click(screen.getByText("Toggle"));
  
  await waitFor(() => {
    const todoText = screen.getByText("New Todo");
    expect(todoText).toHaveStyle("text-decoration: line-through");
  });
});
```

## Testing Async Components

### Suspense Integration

```tsx
const asyncData = provide(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return { message: "Data loaded!" };
});

function AsyncComponent() {
  const [data] = useResolves(asyncData);
  return <div data-testid="async-data">{data.message}</div>;
}

function App() {
  return (
    <ScopeProvider>
      <Suspense fallback={<div data-testid="loading">Loading...</div>}>
        <AsyncComponent />
      </Suspense>
    </ScopeProvider>
  );
}

test("async component with suspense", async () => {
  render(<App />);
  
  // Initially shows loading
  expect(screen.getByTestId("loading")).toBeInTheDocument();
  
  // Wait for data to load
  await waitFor(() => {
    expect(screen.getByTestId("async-data")).toHaveTextContent("Data loaded!");
  });
  
  expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
});
```

### Error Boundaries

```tsx
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  render() {
    if (this.state.hasError) {
      return <div data-testid="error">Something went wrong!</div>;
    }
    return this.props.children;
  }
}

const failingData = provide(async () => {
  await new Promise(resolve => setTimeout(resolve, 50));
  throw new Error("Network error");
});

function FailingComponent() {
  const [data] = useResolves(failingData);
  return <div>{data}</div>;
}

test("error handling with error boundary", async () => {
  render(
    <ErrorBoundary>
      <ScopeProvider>
        <Suspense fallback={<div>Loading...</div>}>
          <FailingComponent />
        </Suspense>
      </ScopeProvider>
    </ErrorBoundary>
  );
  
  await waitFor(() => {
    expect(screen.getByTestId("error")).toBeInTheDocument();
  });
});
```

## Testing Component Patterns

### Conditional Rendering

```tsx
const isLoggedIn = provide(() => false);
const user = provide(() => ({ name: "John Doe" }));

function ConditionalComponent() {
  const [loggedIn, userData] = useResolves(isLoggedIn, user);
  
  if (loggedIn) {
    return <div data-testid="welcome">Welcome, {userData.name}!</div>;
  }
  
  return (
    <button 
      data-testid="login"
      onClick={() => isLoggedIn.update(true)}
    >
      Login
    </button>
  );
}

test("conditional rendering based on state", async () => {
  render(
    <ScopeProvider>
      <ConditionalComponent />
    </ScopeProvider>
  );
  
  // Initially shows login button
  expect(screen.getByTestId("login")).toBeInTheDocument();
  expect(screen.queryByTestId("welcome")).not.toBeInTheDocument();
  
  // Click login
  fireEvent.click(screen.getByTestId("login"));
  
  await waitFor(() => {
    expect(screen.getByTestId("welcome")).toHaveTextContent("Welcome, John Doe!");
    expect(screen.queryByTestId("login")).not.toBeInTheDocument();
  });
});
```

### Component Composition

```tsx
// Parent component that provides state
function TodoApp() {
  return (
    <ScopeProvider>
      <div>
        <TodoForm />
        <TodoList />
        <TodoStats />
      </div>
    </ScopeProvider>
  );
}

const completedCount = derive([todos.reactive], ([todoList]) => 
  todoList.filter(todo => todo.done).length
);

function TodoStats() {
  const [total, completed] = useResolves(
    derive([todos.reactive], ([list]) => list.length),
    completedCount
  );
  
  return (
    <div data-testid="stats">
      {completed} of {total} completed
    </div>
  );
}

test("component composition sharing state", async () => {
  render(<TodoApp />);
  
  // Initial state
  expect(screen.getByTestId("stats")).toHaveTextContent("0 of 0 completed");
  
  // Add todos and verify stats update
  fireEvent.click(screen.getByTestId("add-todo"));
  
  await waitFor(() => {
    expect(screen.getByTestId("stats")).toHaveTextContent("0 of 1 completed");
  });
  
  // Toggle completion
  fireEvent.click(screen.getByText("Toggle"));
  
  await waitFor(() => {
    expect(screen.getByTestId("stats")).toHaveTextContent("1 of 1 completed");
  });
});
```

## Testing Performance

### Re-render Optimization

```tsx
test("component re-render optimization", async () => {
  const renderCount = vi.fn();
  const user = provide(() => ({ 
    name: "John", 
    email: "john@example.com",
    settings: { theme: "dark" }
  }));
  
  function NameComponent() {
    renderCount();
    const name = useResolve(user, (u) => u.name);
    return <div data-testid="name">{name}</div>;
  }
  
  const scope = createScope();
  
  render(
    <ScopeProvider scope={scope}>
      <NameComponent />
    </ScopeProvider>
  );
  
  await waitFor(() => {
    expect(screen.getByTestId("name")).toHaveTextContent("John");
  });
  
  expect(renderCount).toHaveBeenCalledTimes(1);
  
  // Update email (should not trigger re-render of name component)
  await scope.update(user, current => ({ ...current, email: "new@example.com" }));
  
  // Should not re-render because name didn't change
  expect(renderCount).toHaveBeenCalledTimes(1);
  
  // Update name (should trigger re-render)
  await scope.update(user, current => ({ ...current, name: "Jane" }));
  
  await waitFor(() => {
    expect(screen.getByTestId("name")).toHaveTextContent("Jane");
  });
  
  expect(renderCount).toHaveBeenCalledTimes(2);
});
```

## Testing Utilities

### Custom Render Function

```tsx
// Test utilities
function renderWithScope(ui: React.ReactElement, { scope, ...options } = {}) {
  const testScope = scope || createScope();
  
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ScopeProvider scope={testScope}>{children}</ScopeProvider>;
  }
  
  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    scope: testScope
  };
}

// Usage
test("using custom render utility", async () => {
  const counter = provide(() => 0);
  
  function Counter() {
    const [count] = useResolves(counter);
    return <div data-testid="count">{count}</div>;
  }
  
  const { scope } = renderWithScope(<Counter />);
  
  expect(screen.getByTestId("count")).toHaveTextContent("0");
  
  await scope.update(counter, 5);
  
  await waitFor(() => {
    expect(screen.getByTestId("count")).toHaveTextContent("5");
  });
});
```

### State Helpers

```tsx
// Helper for setting up test state
function createTestState() {
  const todos = provide(() => [
    { id: "1", text: "Test todo 1", done: false },
    { id: "2", text: "Test todo 2", done: true }
  ]);
  
  const controller = derive([todos.static], ([todosRef]) => ({
    add: (text: string) => {
      todosRef.update(list => [...list, {
        id: Date.now().toString(),
        text,
        done: false
      }]);
    },
    // ... other methods
  }));
  
  return { todos, controller };
}

test("using state helper", async () => {
  const { todos, controller } = createTestState();
  
  function TodoApp() {
    const [todoList, ctrl] = useResolves(todos, controller);
    return (
      <div>
        <div data-testid="count">{todoList.length}</div>
        <button onClick={() => ctrl.add("New todo")}>Add</button>
      </div>
    );
  }
  
  renderWithScope(<TodoApp />);
  
  expect(screen.getByTestId("count")).toHaveTextContent("2");
  
  fireEvent.click(screen.getByText("Add"));
  
  await waitFor(() => {
    expect(screen.getByTestId("count")).toHaveTextContent("3");
  });
});
```

This comprehensive React testing approach ensures your Pumped Fn React integrations are reliable and perform well in real-world scenarios.