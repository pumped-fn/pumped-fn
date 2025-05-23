import { provide } from "@pumped-fn/core-next";
import { Reactives, useUpdate } from "@pumped-fn/react";

const defaultValue = {
  count: 0,
  user: {
    name: "Test User",
    email: "test@example.com",
    settings: {
      darkMode: false,
      notifications: true,
    },
  },
  items: [
    { id: 1, name: "Item 1", completed: false },
    { id: 2, name: "Item 2", completed: true },
  ],
};

const testExecutor = provide(() => structuredClone(defaultValue));

// Parent component with all child components
export function TestApp() {
  const updateData = useUpdate(testExecutor);

  const incrementCount = () => {
    updateData((current) => ({
      ...current,
      count: current.count + 1,
    }));
  };

  const changeName = () => {
    updateData((current) => ({
      ...current,
      user: {
        ...current.user,
        name: "Updated Name",
      },
    }));
  };

  const toggleDarkMode = () => {
    updateData((current) => ({
      ...current,
      user: {
        ...current.user,
        settings: {
          ...current.user.settings,
          darkMode: !current.user.settings.darkMode,
        },
      },
    }));
  };

  const reset = () => {
    updateData(() => structuredClone(defaultValue));
  };

  const toggleItem = (id: number) => {
    updateData((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      ),
    }));
  };

  return (
    <div>
      <Reactives e={[testExecutor]}>
        {([data]) => <div data-testid="count">{data.count}</div>}
      </Reactives>

      <Reactives e={[testExecutor]}>
        {([data]) => {
          return <div data-testid="email">{data.user.name}</div>;
        }}
      </Reactives>

      <Reactives e={[testExecutor]}>
        {([data]) => {
          return <div data-testid="email">{data.user.email}</div>;
        }}
      </Reactives>

      <Reactives e={[testExecutor]}>
        {([data]) => {
          return (
            <button data-testid="dark-mode-toggle" onClick={toggleDarkMode}>
              {data.user.settings.darkMode ? "Light Mode" : "Dark Mode"}
            </button>
          );
        }}
      </Reactives>

      <Reactives e={[testExecutor]}>
        {([data]) => {
          return (
            <ul data-testid="items-list">
              {data.items.map((item) => (
                <li key={item.id} data-testid={`item-${item.id}`}>
                  <span>{item.name}</span>
                  <button
                    data-testid={`toggle-${item.id}`}
                    onClick={() => toggleItem(item.id)}
                  >
                    {item.completed ? "Mark Incomplete" : "Mark Complete"}
                  </button>
                </li>
              ))}
            </ul>
          );
        }}
      </Reactives>

      <button data-testid="increment-count" onClick={incrementCount}>
        Increment Count
      </button>
      <button data-testid="change-name" onClick={changeName}>
        Change Name
      </button>

      <br />
      <button data-testid="reset" onClick={reset}>
        Reset
      </button>
    </div>
  );
}
