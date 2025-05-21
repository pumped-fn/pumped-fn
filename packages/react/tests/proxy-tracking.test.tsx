import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createExecutor } from '@pumped-fn/core-next';
import { 
  EnhancedScopeProvider, 
  useEnhancedResolve, 
  useEnhancedUpdate 
} from '../src/enhanced-scope';

// Create a test executor with a complex nested structure
const testExecutor = createExecutor(() => ({
  count: 0,
  user: {
    name: 'Test User',
    email: 'test@example.com',
    settings: {
      darkMode: false,
      notifications: true
    }
  },
  items: [
    { id: 1, name: 'Item 1', completed: false },
    { id: 2, name: 'Item 2', completed: true }
  ]
}));

// Component that only uses count
function CountDisplay() {
  const data = useEnhancedResolve(testExecutor);
  return <div data-testid="count">{data.count}</div>;
}

// Component that only uses user.name
function NameDisplay() {
  const data = useEnhancedResolve(testExecutor);
  return <div data-testid="name">{data.user.name}</div>;
}

// Component that only uses user.settings.darkMode
function DarkModeToggle() {
  const data = useEnhancedResolve(testExecutor);
  const updateData = useEnhancedUpdate(testExecutor);
  
  const toggleDarkMode = () => {
    updateData(current => ({
      ...current,
      user: {
        ...current.user,
        settings: {
          ...current.user.settings,
          darkMode: !current.user.settings.darkMode
        }
      }
    }));
  };
  
  return (
    <button 
      data-testid="dark-mode-toggle"
      onClick={toggleDarkMode}
    >
      {data.user.settings.darkMode ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}

// Component that only uses items
function ItemsList() {
  const data = useEnhancedResolve(testExecutor);
  const updateData = useEnhancedUpdate(testExecutor);
  
  const toggleItem = (id: number) => {
    updateData(current => ({
      ...current,
      items: current.items.map(item => 
        item.id === id 
          ? { ...item, completed: !item.completed } 
          : item
      )
    }));
  };
  
  return (
    <ul data-testid="items-list">
      {data.items.map(item => (
        <li key={item.id} data-testid={`item-${item.id}`}>
          <span>{item.name}</span>
          <button 
            data-testid={`toggle-${item.id}`}
            onClick={() => toggleItem(item.id)}
          >
            {item.completed ? 'Mark Incomplete' : 'Mark Complete'}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Parent component with all child components
function TestApp() {
  const updateData = useEnhancedUpdate(testExecutor);
  
  const incrementCount = () => {
    updateData(current => ({
      ...current,
      count: current.count + 1
    }));
  };
  
  const changeName = () => {
    updateData(current => ({
      ...current,
      user: {
        ...current.user,
        name: 'Updated Name'
      }
    }));
  };
  
  return (
    <div>
      <CountDisplay />
      <NameDisplay />
      <DarkModeToggle />
      <ItemsList />
      <button data-testid="increment-count" onClick={incrementCount}>
        Increment Count
      </button>
      <button data-testid="change-name" onClick={changeName}>
        Change Name
      </button>
    </div>
  );
}

describe('Proxy Tracking System', () => {
  beforeEach(() => {
    // Reset the executor before each test
    testExecutor.reset();
  });
  
  it('should render initial state correctly', async () => {
    render(
      <EnhancedScopeProvider>
        <TestApp />
      </EnhancedScopeProvider>
    );
    
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('name').textContent).toBe('Test User');
    expect(screen.getByTestId('dark-mode-toggle').textContent).toBe('Dark Mode');
    expect(screen.getByTestId('item-1')).toBeInTheDocument();
    expect(screen.getByTestId('item-2')).toBeInTheDocument();
  });
  
  it('should update count without affecting other components', async () => {
    const renderSpy = {
      CountDisplay: vi.fn(),
      NameDisplay: vi.fn(),
      DarkModeToggle: vi.fn(),
      ItemsList: vi.fn()
    };
    
    // Create wrapped components with render spies
    const WrappedCountDisplay = () => {
      renderSpy.CountDisplay();
      return <CountDisplay />;
    };
    
    const WrappedNameDisplay = () => {
      renderSpy.NameDisplay();
      return <NameDisplay />;
    };
    
    const WrappedDarkModeToggle = () => {
      renderSpy.DarkModeToggle();
      return <DarkModeToggle />;
    };
    
    const WrappedItemsList = () => {
      renderSpy.ItemsList();
      return <ItemsList />;
    };
    
    function SpyTestApp() {
      const updateData = useEnhancedUpdate(testExecutor);
      
      const incrementCount = () => {
        updateData(current => ({
          ...current,
          count: current.count + 1
        }));
      };
      
      return (
        <div>
          <WrappedCountDisplay />
          <WrappedNameDisplay />
          <WrappedDarkModeToggle />
          <WrappedItemsList />
          <button data-testid="increment-count" onClick={incrementCount}>
            Increment Count
          </button>
        </div>
      );
    }
    
    render(
      <EnhancedScopeProvider>
        <SpyTestApp />
      </EnhancedScopeProvider>
    );
    
    // Clear initial render counts
    vi.clearAllMocks();
    
    // Increment count
    fireEvent.click(screen.getByTestId('increment-count'));
    
    // Only CountDisplay should re-render
    expect(renderSpy.CountDisplay).toHaveBeenCalledTimes(1);
    expect(renderSpy.NameDisplay).toHaveBeenCalledTimes(0);
    expect(renderSpy.DarkModeToggle).toHaveBeenCalledTimes(0);
    expect(renderSpy.ItemsList).toHaveBeenCalledTimes(0);
    
    // Count should be updated
    expect(screen.getByTestId('count').textContent).toBe('1');
  });
  
  it('should update nested properties without affecting unrelated components', async () => {
    render(
      <EnhancedScopeProvider>
        <TestApp />
      </EnhancedScopeProvider>
    );
    
    // Toggle dark mode
    fireEvent.click(screen.getByTestId('dark-mode-toggle'));
    
    // Dark mode should be updated
    expect(screen.getByTestId('dark-mode-toggle').textContent).toBe('Light Mode');
    
    // Other values should remain unchanged
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('name').textContent).toBe('Test User');
  });
  
  it('should update array items correctly', async () => {
    render(
      <EnhancedScopeProvider>
        <TestApp />
      </EnhancedScopeProvider>
    );
    
    // Toggle item 1 completion status
    fireEvent.click(screen.getByTestId('toggle-1'));
    
    // Item 1 button text should change
    expect(screen.getByTestId('toggle-1').textContent).toBe('Mark Complete');
    
    // Toggle item 1 again
    fireEvent.click(screen.getByTestId('toggle-1'));
    
    // Item 1 button text should change back
    expect(screen.getByTestId('toggle-1').textContent).toBe('Mark Incomplete');
  });
});

