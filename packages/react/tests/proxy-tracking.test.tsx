import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { provide } from '@pumped-fn/core-next';
import { ScopeProvider, useResolve, useUpdate } from '../src';

// Mock the useUpdate hook since we're just testing the rendering behavior
vi.mock('../src', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useUpdate: vi.fn().mockImplementation(() => {
      return vi.fn();
    })
  };
});

describe('Proxy Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only re-render when accessed properties change', async () => {
    // Create a test executor with a complex object
    const initialData = {
      name: 'John',
      age: 30,
      address: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001'
      }
    };
    
    let data = { ...initialData };
    const userExecutor = provide(() => data);
    
    // Create update function that will be called by our buttons
    const updateData = (newData: typeof data) => {
      data = newData;
      // Force re-render by triggering the reactive executor
      // This simulates what useUpdate would do
      (userExecutor as any).notify?.(data);
    };
    
    // Spy on component renders
    const nameRenderSpy = vi.fn();
    const ageRenderSpy = vi.fn();
    
    // Component that only uses name
    function NameDisplay() {
      const user = useResolve(userExecutor);
      nameRenderSpy();
      return <div data-testid="name">{user.name}</div>;
    }
    
    // Component that only uses age
    function AgeDisplay() {
      const user = useResolve(userExecutor);
      ageRenderSpy();
      return <div data-testid="age">{user.age}</div>;
    }
    
    // Component with update buttons
    function UserControls() {
      const user = useResolve(userExecutor);
      
      const updateName = () => {
        updateData({
          ...user,
          name: 'Jane'
        });
      };
      
      const updateAge = () => {
        updateData({
          ...user,
          age: 31
        });
      };
      
      const updateAddress = () => {
        updateData({
          ...user,
          address: {
            ...user.address,
            zip: '10002'
          }
        });
      };
      
      return (
        <div>
          <button data-testid="update-name" onClick={updateName}>Update Name</button>
          <button data-testid="update-age" onClick={updateAge}>Update Age</button>
          <button data-testid="update-address" onClick={updateAddress}>Update Address</button>
        </div>
      );
    }
    
    function App() {
      return (
        <ScopeProvider>
          <NameDisplay />
          <AgeDisplay />
          <UserControls />
        </ScopeProvider>
      );
    }
    
    // Render the app
    const { container } = render(<App />);
    
    // Initial render counts
    const initialNameRenderCount = nameRenderSpy.mock.calls.length;
    const initialAgeRenderCount = ageRenderSpy.mock.calls.length;
    
    // Verify the initial render
    expect(screen.getByTestId('name').textContent).toBe('John');
    expect(screen.getByTestId('age').textContent).toBe('30');
    
    // Update name - should only re-render NameDisplay
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-name'));
    });
    
    // Verify name component re-rendered but age component didn't
    expect(nameRenderSpy).toHaveBeenCalledTimes(initialNameRenderCount + 1);
    expect(ageRenderSpy).toHaveBeenCalledTimes(initialAgeRenderCount);
    expect(screen.getByTestId('name').textContent).toBe('Jane');
    
    // Update age - should only re-render AgeDisplay
    const nameRenderCountAfterNameUpdate = nameRenderSpy.mock.calls.length;
    
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-age'));
    });
    
    // Verify age component re-rendered but name component didn't
    expect(nameRenderSpy).toHaveBeenCalledTimes(nameRenderCountAfterNameUpdate);
    expect(ageRenderSpy).toHaveBeenCalledTimes(initialAgeRenderCount + 1);
    expect(screen.getByTestId('age').textContent).toBe('31');
    
    // Update address - should not re-render either component
    const nameRenderCountAfterAgeUpdate = nameRenderSpy.mock.calls.length;
    const ageRenderCountAfterAgeUpdate = ageRenderSpy.mock.calls.length;
    
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-address'));
    });
    
    // Verify neither component re-rendered
    expect(nameRenderSpy).toHaveBeenCalledTimes(nameRenderCountAfterAgeUpdate);
    expect(ageRenderSpy).toHaveBeenCalledTimes(ageRenderCountAfterAgeUpdate);
  });
});
