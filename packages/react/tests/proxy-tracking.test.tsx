import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { provide } from '@pumped-fn/core-next';
import { ScopeProvider, useResolve, useUpdate } from '../src';

describe('Proxy Tracking', () => {
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

    // Render counters to track component renders
    const nameRenderCount = { count: 0 };
    const ageRenderCount = { count: 0 };
    
    // Component that only uses name
    function NameDisplay() {
      const user = useResolve(userExecutor);
      nameRenderCount.count++;
      return <div data-testid="name">{user.name}</div>;
    }
    
    // Component that only uses age
    function AgeDisplay() {
      const user = useResolve(userExecutor);
      ageRenderCount.count++;
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
    const initialNameRenderCount = nameRenderCount.count;
    const initialAgeRenderCount = ageRenderCount.count;
    
    // Update name - should only re-render NameDisplay
    fireEvent.click(screen.getByTestId('update-name'));
    expect(nameRenderCount.count).toBeGreaterThan(initialNameRenderCount);
    expect(ageRenderCount.count).toBe(initialAgeRenderCount);
    expect(screen.getByTestId('name').textContent).toBe('Jane');
    
    // Update age - should only re-render AgeDisplay
    const nameRenderCountAfterNameUpdate = nameRenderCount.count;
    fireEvent.click(screen.getByTestId('update-age'));
    expect(nameRenderCount.count).toBe(nameRenderCountAfterNameUpdate);
    expect(ageRenderCount.count).toBeGreaterThan(initialAgeRenderCount);
    expect(screen.getByTestId('age').textContent).toBe('31');
    
    // Update address - should not re-render either component
    const nameRenderCountAfterAgeUpdate = nameRenderCount.count;
    const ageRenderCountAfterAgeUpdate = ageRenderCount.count;
    fireEvent.click(screen.getByTestId('update-address'));
    expect(nameRenderCount.count).toBe(nameRenderCountAfterAgeUpdate);
    expect(ageRenderCount.count).toBe(ageRenderCountAfterAgeUpdate);
  });
});

