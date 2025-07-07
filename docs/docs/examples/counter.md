# Counter Example

This example demonstrates the core concepts of Pumped Fn with a reactive counter that includes configuration, timers, and derived state.

## Basic Counter

Let's start with a simple counter:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

const counter = provide(() => 0);
const isEven = derive([counter.reactive], ([count]) => count % 2 === 0);

function SimpleCounter() {
  const [count, even] = useResolves(counter, isEven);
  
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h3>Simple Counter</h3>
      <p style={{ fontSize: '2em' }}>{count}</p>
      <p>This number is {even ? 'even' : 'odd'}</p>
      <div>
        <button onClick={() => counter.update(c => c - 1)}>-</button>
        <button onClick={() => counter.update(c => c + 1)} style={{ marginLeft: '10px' }}>+</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <SimpleCounter />
    </ScopeProvider>
  );
}
```

## Configurable Auto-Counter

Now let's create a more advanced counter that automatically increments with configurable settings:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// Configuration state
const config = provide(() => ({
  increment: 1,
  interval: 1000,
  autoIncrement: false
}));

// Counter state
const counter = provide(() => 0);

// Derived states
const isEven = derive([counter.reactive], ([count]) => count % 2 === 0);
const doubled = derive([counter.reactive], ([count]) => count * 2);

// Auto-increment timer
const timer = derive(
  [config.reactive, counter.static],
  ([config, counterRef], controller) => {
    if (!config.autoIncrement) {
      return null;
    }
    
    const intervalId = setInterval(() => {
      counterRef.update(c => c + config.increment);
    }, config.interval);
    
    controller.cleanup(() => {
      clearInterval(intervalId);
    });
    
    return intervalId;
  }
);

// Configuration controller
const configController = derive(
  [config.static],
  ([configRef]) => ({
    setIncrement: (increment) => configRef.update(c => ({ ...c, increment })),
    setInterval: (interval) => configRef.update(c => ({ ...c, interval })),
    toggleAutoIncrement: () => configRef.update(c => ({ ...c, autoIncrement: !c.autoIncrement }))
  })
);

function ConfigurableCounter() {
  const [count, cfg, even, doubled, controller] = useResolves(
    counter, config, isEven, doubled, configController
  );
  
  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
      <h3>Configurable Counter</h3>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <p style={{ fontSize: '2em', margin: '10px 0' }}>{count}</p>
        <p>Doubled: {doubled}</p>
        <p>Status: {even ? 'Even' : 'Odd'}</p>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h4>Configuration</h4>
        <div style={{ marginBottom: '10px' }}>
          <label>
            Increment: 
            <input
              type="number"
              value={cfg.increment}
              onChange={(e) => controller.setIncrement(parseInt(e.target.value))}
              style={{ marginLeft: '10px', width: '60px' }}
            />
          </label>
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label>
            Interval (ms): 
            <input
              type="number"
              value={cfg.interval}
              onChange={(e) => controller.setInterval(parseInt(e.target.value))}
              style={{ marginLeft: '10px', width: '80px' }}
            />
          </label>
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label>
            <input
              type="checkbox"
              checked={cfg.autoIncrement}
              onChange={controller.toggleAutoIncrement}
            />
            {' '}Auto-increment
          </label>
        </div>
      </div>
      
      <div style={{ textAlign: 'center' }}>
        <button onClick={() => counter.update(c => c - cfg.increment)}>
          -{cfg.increment}
        </button>
        <button 
          onClick={() => counter.update(c => c + cfg.increment)} 
          style={{ marginLeft: '10px' }}
        >
          +{cfg.increment}
        </button>
        <button 
          onClick={() => counter.update(0)} 
          style={{ marginLeft: '10px' }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <ConfigurableCounter />
    </ScopeProvider>
  );
}
```

## Multi-Counter Example

Let's create multiple independent counters:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// Counter factory
function createCounter(name, initialValue = 0) {
  const count = provide(() => initialValue);
  const doubled = derive([count.reactive], ([c]) => c * 2);
  const controller = derive([count.static], ([ref]) => ({
    increment: () => ref.update(c => c + 1),
    decrement: () => ref.update(c => c - 1),
    reset: () => ref.update(initialValue)
  }));
  
  return { name, count, doubled, controller };
}

// Create multiple counters
const counter1 = createCounter('Counter A', 0);
const counter2 = createCounter('Counter B', 10);
const counter3 = createCounter('Counter C', -5);

// Sum of all counters
const totalSum = derive(
  [counter1.count.reactive, counter2.count.reactive, counter3.count.reactive],
  ([a, b, c]) => a + b + c
);

function CounterItem({ counter }) {
  const [count, doubled, ctrl] = useResolves(counter.count, counter.doubled, counter.controller);
  
  return (
    <div style={{ 
      border: '1px solid #ccc', 
      padding: '15px', 
      margin: '10px 0', 
      borderRadius: '8px' 
    }}>
      <h4>{counter.name}</h4>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <div>
        <button onClick={ctrl.decrement}>-</button>
        <button onClick={ctrl.increment} style={{ margin: '0 10px' }}>+</button>
        <button onClick={ctrl.reset}>Reset</button>
      </div>
    </div>
  );
}

function MultiCounter() {
  const [total] = useResolves(totalSum);
  
  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h3>Multiple Counters</h3>
      <p style={{ fontSize: '1.2em', textAlign: 'center' }}>
        Total Sum: <strong>{total}</strong>
      </p>
      
      <CounterItem counter={counter1} />
      <CounterItem counter={counter2} />
      <CounterItem counter={counter3} />
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <MultiCounter />
    </ScopeProvider>
  );
}
```

## Key Concepts Demonstrated

### 1. Basic State Management
- Creating state with `provide()`
- Updating state with `.update()`
- Subscribing to state with `useResolves()`

### 2. Derived State
- Computing values with `derive()`
- Automatic updates with `.reactive`
- Chaining derivations

### 3. Side Effects
- Timer management with cleanup
- Conditional side effects
- Resource cleanup

### 4. Configuration Patterns
- Nested state objects
- Configuration controllers
- Dynamic behavior based on config

### 5. Composition
- Reusable counter factory
- Multiple independent instances
- Cross-counter computations

## Best Practices Shown

1. **Separate concerns**: State, derivations, and controllers
2. **Use factories**: For reusable state patterns
3. **Proper cleanup**: Always clean up side effects
4. **Type safety**: Leverage TypeScript inference
5. **Composition**: Build complex behavior from simple pieces

This counter example demonstrates the power and flexibility of Pumped Fn's reactive state management system.