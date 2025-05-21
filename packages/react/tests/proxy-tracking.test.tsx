import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { provide } from '@pumped-fn/core-next';
import { ScopeProvider, useResolve, useUpdate } from '../src';

describe('Proxy Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should only re-render when accessed properties change', async () => {
    // Create a test executor with a complex object
    const userExecutor = provide(() => ({
      name: 'John',
      age: 30,
      address: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001'
      }
    }));

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
      const updateUser = useUpdate(userExecutor);
      const user = useResolve(userExecutor);
      
      const updateName = () => {
        updateUser({
          ...user,
          name: 'Jane'
        });
      };
      
      const updateAge = () => {
        updateUser({
          ...user,
          age: 31
        });
      };
      
      const updateAddress = () => {
        updateUser({
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
    render(<App />);
    
    // Initial render counts
    const initialNameRenderCount = nameRenderSpy.mock.calls.length;
    const initialAgeRenderCount = ageRenderSpy.mock.calls.length;
    
    // Update name - should only re-render NameDisplay
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-name'));
    });
    
    expect(nameRenderSpy).toHaveBeenCalledTimes(initialNameRenderCount + 1);
    expect(ageRenderSpy).toHaveBeenCalledTimes(initialAgeRenderCount);
    expect(screen.getByTestId('name').textContent).toBe('Jane');
    
    // Update age - should only re-render AgeDisplay
    const nameRenderCountAfterNameUpdate = nameRenderSpy.mock.calls.length;
    
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-age'));
    });
    
    expect(nameRenderSpy).toHaveBeenCalledTimes(nameRenderCountAfterNameUpdate);
    expect(ageRenderSpy).toHaveBeenCalledTimes(initialAgeRenderCount + 1);
    expect(screen.getByTestId('age').textContent).toBe('31');
    
    // Update address - should not re-render either component
    const nameRenderCountAfterAgeUpdate = nameRenderSpy.mock.calls.length;
    const ageRenderCountAfterAgeUpdate = ageRenderSpy.mock.calls.length;
    
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-address'));
    });
    
    expect(nameRenderSpy).toHaveBeenCalledTimes(nameRenderCountAfterAgeUpdate);
    expect(ageRenderSpy).toHaveBeenCalledTimes(ageRenderCountAfterAgeUpdate);
  });
});
