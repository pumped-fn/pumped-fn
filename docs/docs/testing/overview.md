# Testing Overview

Testing applications built with Pumped Fn is straightforward and powerful thanks to the built-in `preset` feature. Instead of complex mocking, you can easily simulate different application states by presetting executor values and observing how your derived state and components behave.

## Testing Philosophy

Pumped Fn's testing approach is designed around:

- **State Simulation**: Use `preset` to simulate different application states
- **Derived Logic Testing**: Test how your derived state responds to different inputs
- **Component Behavior**: Test React components under various state conditions
- **Integration Testing**: Test how different parts of your application work together
- **No Mocking Required**: Built-in tools eliminate the need for complex mocking

## Testing Tools

Pumped Fn works excellently with modern testing tools:

### Core Testing Stack
- **[Vitest](https://vitest.dev/)** - Fast unit testing framework
- **[@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/)** - React component testing
- **[@testing-library/jest-dom](https://github.com/testing-library/jest-dom)** - Additional jest matchers

### Setup Example

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom", // For React testing
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

```typescript
// tests/setup.ts
import "@testing-library/jest-dom";
```

## The `preset` Approach

The key to testing with Pumped Fn is the `preset` function. Instead of mocking, you create test scopes with specific executor values preset to simulate different application states.

```typescript
import { createScope, preset } from "@pumped-fn/core-next";

// Your application state
const user = provide(() => null);
const isLoggedIn = derive([user.reactive], ([u]) => u !== null);

// Test different scenarios by presetting values
const loggedOutScope = createScope(); // user defaults to null
const loggedInScope = createScope(preset(user, { id: 1, name: "John" }));
```

## What to Test

### 1. Derived State Logic
Test how your business logic responds to different input states:

```typescript
test("user status derivation", async () => {
  // Test logged out state
  const loggedOutResult = await loggedOutScope.resolve(isLoggedIn);
  expect(loggedOutResult).toBe(false);
  
  // Test logged in state  
  const loggedInResult = await loggedInScope.resolve(isLoggedIn);
  expect(loggedInResult).toBe(true);
});
```

### 2. Component Behavior
Test how components render under different state conditions:

```typescript
test("dashboard shows correct content", () => {
  // Test with logged out user
  const { getByText } = render(
    <ScopeProvider scope={loggedOutScope}>
      <Dashboard />
    </ScopeProvider>
  );
  expect(getByText("Please log in")).toBeInTheDocument();
  
  // Test with logged in user
  const { getByText: getByTextLoggedIn } = render(
    <ScopeProvider scope={loggedInScope}>
      <Dashboard />
    </ScopeProvider>
  );
  expect(getByTextLoggedIn("Welcome, John")).toBeInTheDocument();
});
```

### 3. Complex State Interactions
Test how multiple parts of your state work together:

```typescript
const cart = provide(() => []);
const cartTotal = derive([cart.reactive], ([items]) => 
  items.reduce((sum, item) => sum + item.price, 0)
);

test("cart calculations", async () => {
  const testScope = createScope(preset(cart, [
    { id: 1, price: 10.99 },
    { id: 2, price: 25.50 }
  ]));
  
  const total = await testScope.resolve(cartTotal);
  expect(total).toBe(36.49);
});
```

## Testing Patterns

### State Simulation with Preset

The most powerful pattern is using `preset` to simulate different application states:

```typescript
import { test, expect } from "vitest";
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";

// Application state
const currentUser = provide(() => null);
const userSettings = provide(() => ({ theme: "light", notifications: true }));
const isAdmin = derive([currentUser.reactive], ([user]) => user?.role === "admin");

test("admin privileges", async () => {
  // Test regular user
  const userScope = createScope(
    preset(currentUser, { id: 1, name: "John", role: "user" })
  );
  expect(await userScope.resolve(isAdmin)).toBe(false);
  
  // Test admin user
  const adminScope = createScope(
    preset(currentUser, { id: 2, name: "Jane", role: "admin" })
  );
  expect(await adminScope.resolve(isAdmin)).toBe(true);
});
```

### Testing Complex Derivations

Test business logic by presetting inputs and observing outputs:

```typescript
const orders = provide(() => []);
const inventory = provide(() => new Map());

const canFulfillOrders = derive(
  [orders.reactive, inventory.reactive],
  ([orderList, stock]) => {
    return orderList.every(order => 
      order.items.every(item => 
        (stock.get(item.productId) || 0) >= item.quantity
      )
    );
  }
);

test("order fulfillment logic", async () => {
  const testOrders = [
    { id: 1, items: [{ productId: "A", quantity: 2 }] },
    { id: 2, items: [{ productId: "B", quantity: 1 }] }
  ];
  
  // Test insufficient inventory
  const lowStockScope = createScope(
    preset(orders, testOrders),
    preset(inventory, new Map([["A", 1], ["B", 0]])) // Not enough stock
  );
  expect(await lowStockScope.resolve(canFulfillOrders)).toBe(false);
  
  // Test sufficient inventory
  const goodStockScope = createScope(
    preset(orders, testOrders),
    preset(inventory, new Map([["A", 5], ["B", 3]])) // Enough stock
  );
  expect(await goodStockScope.resolve(canFulfillOrders)).toBe(true);
});
```

### Testing React Components with Different States

Use preset scopes to test components under various conditions:

```tsx
import { render, screen } from "@testing-library/react";
import { provide, derive, preset, createScope } from "@pumped-fn/core-next";
import { useResolves, ScopeProvider } from "@pumped-fn/react";

const user = provide(() => null);
const theme = provide(() => "light");
const userGreeting = derive(
  [user.reactive, theme.reactive],
  ([user, theme]) => ({
    message: user ? `Hello, ${user.name}!` : "Please log in",
    className: theme === "dark" ? "dark-theme" : "light-theme"
  })
);

function Greeting() {
  const [greeting] = useResolves(userGreeting);
  return (
    <div className={greeting.className} data-testid="greeting">
      {greeting.message}
    </div>
  );
}

test("greeting component states", () => {
  // Test logged out state
  const loggedOutScope = createScope(); // user defaults to null
  const { container: loggedOut } = render(
    <ScopeProvider scope={loggedOutScope}>
      <Greeting />
    </ScopeProvider>
  );
  expect(screen.getByTestId("greeting")).toHaveTextContent("Please log in");
  expect(loggedOut.firstChild).toHaveClass("light-theme");
  
  // Test logged in with dark theme
  const loggedInDarkScope = createScope(
    preset(user, { id: 1, name: "Alice" }),
    preset(theme, "dark")
  );
  const { container: loggedInDark } = render(
    <ScopeProvider scope={loggedInDarkScope}>
      <Greeting />
    </ScopeProvider>
  );
  expect(screen.getByTestId("greeting")).toHaveTextContent("Hello, Alice!");
  expect(loggedInDark.firstChild).toHaveClass("dark-theme");
});
```

## Advanced Testing Scenarios

### Testing Error States

Use preset to simulate error conditions and test how your application handles them:

```typescript
const apiStatus = provide(() => "success");
const userData = derive([apiStatus.reactive], ([status]) => {
  if (status === "error") {
    throw new Error("Failed to load user data");
  }
  return { id: 1, name: "User" };
});

const userDisplay = derive([userData], ([user]) => `Welcome ${user.name}`);

test("error handling in derivation chain", async () => {
  // Test success case
  const successScope = createScope(preset(apiStatus, "success"));
  expect(await successScope.resolve(userDisplay)).toBe("Welcome User");
  
  // Test error case
  const errorScope = createScope(preset(apiStatus, "error"));
  await expect(errorScope.resolve(userDisplay)).rejects.toThrow("Failed to load user data");
});
```

### Testing Async Behavior

Preset async executors to test different timing scenarios:

```typescript
const apiData = provide(async () => {
  // In real app, this would be an API call
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { items: [] };
});

test("async data loading", async () => {
  // Test with preset data (no async wait)
  const testScope = createScope(preset(apiData, { items: ["item1", "item2"] }));
  const result = await testScope.resolve(apiData);
  expect(result.items).toHaveLength(2);
});
```

### Testing Conditional Logic

Use preset to test different branches of conditional derivations:

```typescript
const userRole = provide(() => "guest");
const featureFlags = provide(() => ({ betaFeatures: false }));

const availableFeatures = derive(
  [userRole.reactive, featureFlags.reactive],
  ([role, flags]) => {
    const features = ["dashboard"];
    
    if (role === "admin") {
      features.push("admin-panel", "user-management");
    }
    
    if (role === "user" || role === "admin") {
      features.push("profile", "settings");
    }
    
    if (flags.betaFeatures && role !== "guest") {
      features.push("beta-feature");
    }
    
    return features;
  }
);

test("feature availability logic", async () => {
  // Test guest user
  const guestScope = createScope(preset(userRole, "guest"));
  expect(await guestScope.resolve(availableFeatures)).toEqual(["dashboard"]);
  
  // Test regular user
  const userScope = createScope(preset(userRole, "user"));
  expect(await userScope.resolve(availableFeatures)).toEqual([
    "dashboard", "profile", "settings"
  ]);
  
  // Test admin user
  const adminScope = createScope(preset(userRole, "admin"));
  expect(await adminScope.resolve(availableFeatures)).toEqual([
    "dashboard", "admin-panel", "user-management", "profile", "settings"
  ]);
  
  // Test user with beta features
  const betaUserScope = createScope(
    preset(userRole, "user"),
    preset(featureFlags, { betaFeatures: true })
  );
  expect(await betaUserScope.resolve(availableFeatures)).toEqual([
    "dashboard", "profile", "settings", "beta-feature"
  ]);
});
```

## Best Practices

### 1. Use Preset for State Simulation
Instead of complex mocking, use `preset` to simulate different application states:

```typescript
// ❌ Avoid complex mocking
const mockApi = vi.fn().mockResolvedValue(userData);

// ✅ Use preset for clean state simulation
const testScope = createScope(preset(currentUser, userData));
```

### 2. Test Business Logic, Not Implementation
Focus on testing the behavior of your derived state:

```typescript
// ❌ Testing implementation details
test("executor internal behavior", async () => {
  const executor = provide(() => 0);
  expect(executor.factory).toBeInstanceOf(Function);
});

// ✅ Testing business logic
test("discount calculation", async () => {
  const testScope = createScope(
    preset(cartTotal, 100),
    preset(userLevel, "premium")
  );
  expect(await testScope.resolve(finalPrice)).toBe(85); // 15% discount
});
```

### 3. Create Meaningful Test Scenarios
Use preset to create realistic application states:

```typescript
test("checkout flow for different user types", async () => {
  const newUserScope = createScope(
    preset(user, { id: 1, accountAge: 0, verified: false }),
    preset(cart, [{ id: "item1", price: 50 }])
  );
  
  const premiumUserScope = createScope(
    preset(user, { id: 2, accountAge: 365, verified: true }),
    preset(cart, [{ id: "item1", price: 50 }])
  );
  
  // Test different checkout experiences
  expect(await newUserScope.resolve(checkoutFlow)).toEqual({
    requiresVerification: true,
    shippingOptions: ["standard"],
    paymentMethods: ["card"]
  });
  
  expect(await premiumUserScope.resolve(checkoutFlow)).toEqual({
    requiresVerification: false,
    shippingOptions: ["standard", "express", "overnight"],
    paymentMethods: ["card", "paypal", "store-credit"]
  });
});
```

### 4. Test Edge Cases with Preset
Use preset to easily test boundary conditions:

```typescript
test("edge cases for order processing", async () => {
  // Test empty cart
  const emptyCartScope = createScope(preset(cart, []));
  expect(await emptyCartScope.resolve(canCheckout)).toBe(false);
  
  // Test maximum items
  const maxItemsScope = createScope(preset(cart, new Array(100).fill({ price: 1 })));
  expect(await maxItemsScope.resolve(cartWarnings)).toContain("Cart limit reached");
  
  // Test zero-price items
  const freebieScope = createScope(preset(cart, [{ price: 0, name: "Free sample" }]));
  expect(await freebieScope.resolve(cartTotal)).toBe(0);
});
```

### 5. Keep Tests Readable
Use descriptive preset values that make test intent clear:

```typescript
test("notification preferences", async () => {
  const marketingOptOutScope = createScope(
    preset(userPreferences, {
      marketing: false,
      security: true,
      updates: true
    })
  );
  
  const allNotificationsScope = createScope(
    preset(userPreferences, {
      marketing: true,
      security: true,
      updates: true
    })
  );
  
  // Clear test intent from the preset values
  expect(await marketingOptOutScope.resolve(emailTypes)).not.toContain("marketing");
  expect(await allNotificationsScope.resolve(emailTypes)).toContain("marketing");
});
```

## Next Steps

- [Testing Executors](./testing-executors.md) - Deep dive into executor testing
- [Testing React Components](./testing-react.md) - React-specific testing patterns
- [Testing Utilities](./testing-utilities.md) - Helper functions and testing tools
- [Interactive Testing Examples](./interactive-testing.md) - Live, runnable testing examples