# Interactive Testing Examples

This page provides live, interactive examples of how to test Pumped Fn applications using the `preset` approach. You can run these examples right in your browser to see how preset-based testing works.

## Preset-Based Testing Demo

Here's a live example showing how to use `preset` to test different application states:

```tsx live
import React, { useState } from 'react';
import { provide, derive, createScope, preset } from '@pumped-fn/core-next';
import { ScopeProvider } from '@pumped-fn/react';

function PresetTestingDemo() {
  const [testResults, setTestResults] = useState([]);
  
  const runTests = async () => {
    const results = [];
    
    // Application state
    const userRole = provide(() => "guest");
    const isLoggedIn = provide(() => false);
    const cart = provide(() => []);
    
    // Derived state
    const canCheckout = derive(
      [isLoggedIn.reactive, cart.reactive], 
      ([loggedIn, cartItems]) => loggedIn && cartItems.length > 0
    );
    
    const availableFeatures = derive(
      [userRole.reactive, isLoggedIn.reactive],
      ([role, loggedIn]) => {
        const features = ["browse"];
        if (loggedIn) features.push("profile");
        if (role === "admin") features.push("admin-panel");
        return features;
      }
    );
    
    try {
      // Test 1: Guest user (default state)
      const guestScope = createScope(); // Uses default values
      const guestCanCheckout = await guestScope.resolve(canCheckout);
      const guestFeatures = await guestScope.resolve(availableFeatures);
      
      results.push({
        test: "Guest user defaults",
        passed: !guestCanCheckout && guestFeatures.length === 1,
        details: `canCheckout: ${guestCanCheckout}, features: [${guestFeatures.join(', ')}]`
      });
      
      // Test 2: Logged in user with items in cart
      const loggedInUserScope = createScope(
        preset(isLoggedIn, true),
        preset(userRole, "user"),
        preset(cart, [{ id: 1, name: "Product" }])
      );
      
      const userCanCheckout = await loggedInUserScope.resolve(canCheckout);
      const userFeatures = await loggedInUserScope.resolve(availableFeatures);
      
      results.push({
        test: "Logged in user with cart",
        passed: userCanCheckout && userFeatures.includes("profile"),
        details: `canCheckout: ${userCanCheckout}, features: [${userFeatures.join(', ')}]`
      });
      
      // Test 3: Admin user
      const adminScope = createScope(
        preset(isLoggedIn, true),
        preset(userRole, "admin"),
        preset(cart, [])
      );
      
      const adminCanCheckout = await adminScope.resolve(canCheckout);
      const adminFeatures = await adminScope.resolve(availableFeatures);
      
      results.push({
        test: "Admin user with empty cart",
        passed: !adminCanCheckout && adminFeatures.includes("admin-panel"),
        details: `canCheckout: ${adminCanCheckout}, features: [${adminFeatures.join(', ')}]`
      });
      
    } catch (error) {
      results.push({
        test: "Error occurred",
        passed: false,
        details: error.message
      });
    }
    
    setTestResults(results);
  };
  
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h3>Preset Testing Demo</h3>
      <p style={{ marginBottom: '20px', color: '#666' }}>
        This demo shows how to test different application states using <code>preset</code>
      </p>
      <button 
        onClick={runTests}
        style={{ 
          padding: '10px 20px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}
      >
        Run Preset Tests
      </button>
      
      {testResults.length > 0 && (
        <div>
          <h4>Test Results:</h4>
          {testResults.map((result, index) => (
            <div 
              key={index}
              style={{
                padding: '10px',
                margin: '5px 0',
                backgroundColor: result.passed ? '#d4edda' : '#f8d7da',
                color: result.passed ? '#155724' : '#721c24',
                border: `1px solid ${result.passed ? '#c3e6cb' : '#f5c6cb'}`,
                borderRadius: '4px'
              }}
            >
              <strong>{result.passed ? '✓ PASS' : '✗ FAIL'}</strong> {result.test}
              <br />
              <small>{result.details}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <TestingDemo />
    </ScopeProvider>
  );
}
```

## React Component Testing Simulation

Here's an interactive example showing how React component testing would work:

```tsx live
import React, { useState } from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// Test state
const counter = provide(() => 0);
const doubled = derive([counter.reactive], ([count]) => count * 2);

// Component to test
function CounterComponent() {
  const [count, doubledValue] = useResolves(counter, doubled);
  
  return (
    <div style={{ 
      padding: '15px', 
      border: '1px solid #ccc', 
      borderRadius: '8px',
      margin: '10px 0'
    }}>
      <h4>Counter Component</h4>
      <div data-testid="count">Count: {count}</div>
      <div data-testid="doubled">Doubled: {doubledValue}</div>
      <button 
        data-testid="increment"
        onClick={() => counter.update(c => c + 1)}
        style={{ marginTop: '10px', marginRight: '10px' }}
      >
        Increment
      </button>
      <button 
        data-testid="reset"
        onClick={() => counter.update(0)}
        style={{ marginTop: '10px' }}
      >
        Reset
      </button>
    </div>
  );
}

// Test simulation component
function TestSimulator() {
  const [testLog, setTestLog] = useState([]);
  const [currentValues, setCurrentValues] = useResolves(counter, doubled);
  
  const logTest = (description, condition, expected, actual) => {
    const passed = condition;
    setTestLog(prev => [...prev, {
      description,
      passed,
      expected,
      actual,
      timestamp: Date.now()
    }]);
  };
  
  const runComponentTest = () => {
    setTestLog([]);
    
    // Simulate test steps
    setTimeout(() => {
      logTest(
        "Initial render check",
        currentValues[0] === 0 && currentValues[1] === 0,
        "count: 0, doubled: 0",
        `count: ${currentValues[0]}, doubled: ${currentValues[1]}`
      );
    }, 100);
  };
  
  const simulateClick = () => {
    counter.update(c => c + 1);
    
    setTimeout(() => {
      logTest(
        "After increment click",
        currentValues[0] > 0 && currentValues[1] === currentValues[0] * 2,
        "count > 0, doubled = count * 2",
        `count: ${currentValues[0]}, doubled: ${currentValues[1]}`
      );
    }, 100);
  };
  
  return (
    <div style={{ padding: '20px' }}>
      <h3>React Component Testing Simulation</h3>
      
      <CounterComponent />
      
      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={runComponentTest}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            marginRight: '10px'
          }}
        >
          Run Initial Test
        </button>
        
        <button 
          onClick={simulateClick}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px'
          }}
        >
          Simulate Click & Test
        </button>
      </div>
      
      {testLog.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h4>Test Log:</h4>
          {testLog.map((log, index) => (
            <div 
              key={index}
              style={{
                padding: '8px',
                margin: '5px 0',
                backgroundColor: log.passed ? '#d4edda' : '#f8d7da',
                color: log.passed ? '#155724' : '#721c24',
                border: `1px solid ${log.passed ? '#c3e6cb' : '#f5c6cb'}`,
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <strong>{log.passed ? '✓ PASS' : '✗ FAIL'}</strong> {log.description}
              <br />
              <small>Expected: {log.expected} | Got: {log.actual}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <TestSimulator />
    </ScopeProvider>
  );
}
```

## Async Testing Example

Here's how to test async executors and error handling:

```tsx live
import React, { useState } from 'react';
import { provide, derive, createScope } from '@pumped-fn/core-next';
import { ScopeProvider } from '@pumped-fn/react';

function AsyncTestingDemo() {
  const [testResults, setTestResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  
  const runAsyncTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    const results = [];
    
    try {
      // Test 1: Successful async executor
      const asyncData = provide(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return { message: "Data loaded successfully!" };
      });
      
      const scope = createScope();
      const startTime = Date.now();
      const result = await scope.resolve(asyncData);
      const duration = Date.now() - startTime;
      
      results.push({
        test: "Async data loading",
        passed: result.message === "Data loaded successfully!" && duration >= 500,
        details: `Resolved with: "${result.message}" in ${duration}ms`
      });
      
      // Test 2: Error handling
      const failingExecutor = provide(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        throw new Error("Network timeout");
      });
      
      try {
        await scope.resolve(failingExecutor);
        results.push({
          test: "Error handling",
          passed: false,
          details: "Expected error but resolved successfully"
        });
      } catch (error) {
        results.push({
          test: "Error handling",
          passed: error.message === "Network timeout",
          details: `Caught error: "${error.message}"`
        });
      }
      
      // Test 3: Dependent async executors
      const user = provide(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        return { id: 1, name: "John Doe" };
      });
      
      const userPosts = derive([user], async ([userData]) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return [`Post 1 by ${userData.name}`, `Post 2 by ${userData.name}`];
      });
      
      const posts = await scope.resolve(userPosts);
      results.push({
        test: "Async dependency chain",
        passed: posts.length === 2 && posts[0].includes("John Doe"),
        details: `Posts: ${JSON.stringify(posts)}`
      });
      
    } catch (error) {
      results.push({
        test: "Unexpected error",
        passed: false,
        details: error.message
      });
    }
    
    setTestResults(results);
    setIsRunning(false);
  };
  
  return (
    <div style={{ padding: '20px' }}>
      <h3>Async Testing Demo</h3>
      <button 
        onClick={runAsyncTests}
        disabled={isRunning}
        style={{ 
          padding: '10px 20px', 
          backgroundColor: isRunning ? '#6c757d' : '#007bff', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}
      >
        {isRunning ? 'Running Tests...' : 'Run Async Tests'}
      </button>
      
      {isRunning && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          ⏳ Running async tests... This may take a few seconds.
        </div>
      )}
      
      {testResults.length > 0 && (
        <div>
          <h4>Async Test Results:</h4>
          {testResults.map((result, index) => (
            <div 
              key={index}
              style={{
                padding: '10px',
                margin: '5px 0',
                backgroundColor: result.passed ? '#d4edda' : '#f8d7da',
                color: result.passed ? '#155724' : '#721c24',
                border: `1px solid ${result.passed ? '#c3e6cb' : '#f5c6cb'}`,
                borderRadius: '4px'
              }}
            >
              <strong>{result.passed ? '✓ PASS' : '✗ FAIL'}</strong> {result.test}
              <br />
              <small>{result.details}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <AsyncTestingDemo />
    </ScopeProvider>
  );
}
```

## Key Testing Principles with Preset

Based on these interactive examples, here are the key testing principles for Pumped Fn:

### 1. **Use Preset Instead of Mocking**
- `preset` allows you to simulate any application state
- No need for complex mocking of APIs or external dependencies
- Test how your derived state responds to different input conditions

### 2. **Test Business Logic, Not Implementation**
- Focus on testing the behavior of your derived state
- Verify that your business rules work correctly under different conditions
- Test edge cases by presetting boundary values

### 3. **Create Realistic Test Scenarios**
- Use preset to simulate real-world application states
- Test different user types, permissions, and data conditions
- Verify component behavior under various state combinations

### 4. **Keep Tests Simple and Readable**
- Preset values make test intent clear
- Each test scenario is self-contained and easy to understand
- No complex setup or teardown required

### 5. **Test State Interactions**
- Use multiple presets to test complex state relationships
- Verify how different parts of your application state work together
- Test conditional logic and feature flags easily

The `preset` approach makes testing Pumped Fn applications elegant, readable, and comprehensive without the complexity of traditional mocking frameworks.