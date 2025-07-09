/**
 * Advanced Frontend Store Testing Examples
 * 
 * This file demonstrates comprehensive testing strategies for frontend stores
 * built with Pumped Functions, showcasing how .static controllers enable
 * excellent testability and isolation.
 * 
 * Key Testing Patterns:
 * 1. Use `preset` to provide initial state for tests
 * 2. Create isolated scopes for each test case
 * 3. Test controllers independently from UI
 * 4. Use preset to replace external dependencies (APIs, services)
 * 5. No need for mocking frameworks - preset handles test doubles
 */

import { createScope, provide, derive, preset } from "@pumped-fn/core-next";
import type { Core } from "@pumped-fn/core-next";

// Mock types for our examples
type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

type User = {
  id: string;
  name: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
    language: string;
  };
};

// Example Store Definition
const user = provide(() => ({
  id: '1',
  name: 'Anonymous',
  email: 'user@example.com',
  preferences: {
    theme: 'light' as const,
    notifications: true,
    language: 'en'
  }
}));

const cartItems = provide(() => [] as CartItem[]);

const apiStatus = provide(() => ({
  loading: false,
  error: null as string | null,
  lastFetch: null as Date | null
}));

// Controllers using .static pattern
const userController = derive(user.static, (userCtl) => ({
  updateProfile: (updates: Partial<User>) => 
    userCtl.update(current => ({ ...current, ...updates })),
  
  updatePreferences: (preferences: Partial<User['preferences']>) =>
    userCtl.update(current => ({
      ...current,
      preferences: { ...current.preferences, ...preferences }
    })),
  
  toggleTheme: () => 
    userCtl.update(current => ({
      ...current,
      preferences: {
        ...current.preferences,
        theme: current.preferences.theme === 'light' ? 'dark' : 'light'
      }
    }))
}));

const cartController = derive(cartItems.static, (cartCtl) => ({
  addItem: (product: Product, quantity: number = 1) => {
    cartCtl.update(current => {
      const existingItem = current.find(item => item.productId === product.id);
      
      if (existingItem) {
        return current.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      
      return [...current, {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity
      }];
    });
  },
  
  removeItem: (productId: string) => {
    cartCtl.update(current => current.filter(item => item.productId !== productId));
  },
  
  updateQuantity: (productId: string, quantity: number) => {
    cartCtl.update(current => 
      current.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  },
  
  clear: () => cartCtl.update([])
}));

const apiController = derive(apiStatus.static, (statusCtl) => ({
  setLoading: (loading: boolean) => 
    statusCtl.update(current => ({ ...current, loading })),
  
  setError: (error: string | null) => 
    statusCtl.update(current => ({ ...current, error })),
  
  setLastFetch: (date: Date) => 
    statusCtl.update(current => ({ ...current, lastFetch: date }))
}));

// Derived state
const cartSummary = derive(cartItems.reactive, (items) => {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return {
    itemCount,
    subtotal,
    isEmpty: items.length === 0
  };
});

const userTheme = derive(user.reactive, (user) => ({
  isDark: user.preferences.theme === 'dark',
  cssClass: `theme-${user.preferences.theme}`,
  contrastText: user.preferences.theme === 'dark' ? 'white' : 'black'
}));

// API simulation
const userAPI = derive([apiController], ([apiCtl]) => ({
  fetchUser: async (id: string): Promise<User> => {
    apiCtl.setLoading(true);
    apiCtl.setError(null);
    
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Simulate potential failure
      if (id === 'error') {
        throw new Error('User not found');
      }
      
      const userData = {
        id,
        name: 'John Doe',
        email: 'john@example.com',
        preferences: {
          theme: 'light' as const,
          notifications: true,
          language: 'en'
        }
      };
      
      apiCtl.setLastFetch(new Date());
      apiCtl.setLoading(false);
      
      return userData;
    } catch (error) {
      apiCtl.setError(error.message);
      apiCtl.setLoading(false);
      throw error;
    }
  }
}));

// Store export
const store = {
  user,
  cartItems,
  apiStatus,
  userController,
  cartController,
  apiController,
  cartSummary,
  userTheme,
  userAPI
};

// Test Suite
describe("Frontend Store Testing", () => {
  let scope: Core.Scope;
  
  beforeEach(() => {
    scope = createScope();
  });
  
  afterEach(async () => {
    await scope.dispose();
  });

  describe("User Controller", () => {
    it("should update user profile", async () => {
      const controller = await scope.resolve(store.userController);
      
      await controller.updateProfile({
        name: "Alice Smith",
        email: "alice@example.com"
      });
      
      const updatedUser = await scope.resolve(store.user);
      expect(updatedUser.name).toBe("Alice Smith");
      expect(updatedUser.email).toBe("alice@example.com");
      expect(updatedUser.id).toBe("1"); // Should preserve existing fields
    });
    
    it("should update preferences independently", async () => {
      const controller = await scope.resolve(store.userController);
      
      await controller.updatePreferences({
        theme: "dark",
        notifications: false
      });
      
      const updatedUser = await scope.resolve(store.user);
      expect(updatedUser.preferences.theme).toBe("dark");
      expect(updatedUser.preferences.notifications).toBe(false);
      expect(updatedUser.preferences.language).toBe("en"); // Should preserve
    });
    
    it("should toggle theme correctly", async () => {
      const controller = await scope.resolve(store.userController);
      
      // Start with light theme
      let user = await scope.resolve(store.user);
      expect(user.preferences.theme).toBe("light");
      
      // Toggle to dark
      await controller.toggleTheme();
      user = await scope.resolve(store.user);
      expect(user.preferences.theme).toBe("dark");
      
      // Toggle back to light
      await controller.toggleTheme();
      user = await scope.resolve(store.user);
      expect(user.preferences.theme).toBe("light");
    });
  });

  describe("Cart Controller", () => {
    const mockProduct: Product = {
      id: "prod1",
      name: "Test Product",
      price: 29.99,
      category: "test"
    };

    it("should add new item to cart", async () => {
      const controller = await scope.resolve(store.cartController);
      
      await controller.addItem(mockProduct, 2);
      
      const cart = await scope.resolve(store.cartItems);
      expect(cart).toHaveLength(1);
      expect(cart[0]).toEqual({
        productId: "prod1",
        name: "Test Product",
        price: 29.99,
        quantity: 2
      });
    });
    
    it("should increment quantity for existing item", async () => {
      const controller = await scope.resolve(store.cartController);
      
      // Add item initially
      await controller.addItem(mockProduct, 1);
      
      // Add same item again
      await controller.addItem(mockProduct, 3);
      
      const cart = await scope.resolve(store.cartItems);
      expect(cart).toHaveLength(1);
      expect(cart[0].quantity).toBe(4);
    });
    
    it("should remove item from cart", async () => {
      const controller = await scope.resolve(store.cartController);
      
      // Add item
      await controller.addItem(mockProduct, 2);
      
      // Remove item
      await controller.removeItem("prod1");
      
      const cart = await scope.resolve(store.cartItems);
      expect(cart).toHaveLength(0);
    });
    
    it("should update item quantity", async () => {
      const controller = await scope.resolve(store.cartController);
      
      // Add item
      await controller.addItem(mockProduct, 2);
      
      // Update quantity
      await controller.updateQuantity("prod1", 5);
      
      const cart = await scope.resolve(store.cartItems);
      expect(cart[0].quantity).toBe(5);
    });
    
    it("should clear entire cart", async () => {
      const controller = await scope.resolve(store.cartController);
      
      // Add multiple items
      await controller.addItem(mockProduct, 2);
      await controller.addItem({ ...mockProduct, id: "prod2" }, 1);
      
      // Clear cart
      await controller.clear();
      
      const cart = await scope.resolve(store.cartItems);
      expect(cart).toHaveLength(0);
    });
  });

  describe("Derived State", () => {
    it("should calculate cart summary correctly", async () => {
      const controller = await scope.resolve(store.cartController);
      
      // Add items
      await controller.addItem({ id: "1", name: "Item 1", price: 10, category: "test" }, 2);
      await controller.addItem({ id: "2", name: "Item 2", price: 15, category: "test" }, 1);
      
      const summary = await scope.resolve(store.cartSummary);
      
      expect(summary.itemCount).toBe(3); // 2 + 1
      expect(summary.subtotal).toBe(35); // (10 * 2) + (15 * 1)
      expect(summary.isEmpty).toBe(false);
    });
    
    it("should derive user theme settings", async () => {
      const userController = await scope.resolve(store.userController);
      
      // Test light theme
      let theme = await scope.resolve(store.userTheme);
      expect(theme.isDark).toBe(false);
      expect(theme.cssClass).toBe("theme-light");
      expect(theme.contrastText).toBe("black");
      
      // Switch to dark theme
      await userController.toggleTheme();
      theme = await scope.resolve(store.userTheme);
      expect(theme.isDark).toBe(true);
      expect(theme.cssClass).toBe("theme-dark");
      expect(theme.contrastText).toBe("white");
    });
  });

  describe("Reactive Updates", () => {
    it("should update derived state when dependencies change", async () => {
      const cartController = await scope.resolve(store.cartController);
      
      // Set up reactive subscription
      const summaryAccessor = await scope.resolveAccessor(store.cartSummary);
      let updateCount = 0;
      
      const cleanup = scope.onUpdate(store.cartSummary, () => {
        updateCount++;
      });
      
      // Trigger change
      await cartController.addItem({ id: "1", name: "Item", price: 10, category: "test" }, 1);
      
      // Verify reactive update
      expect(updateCount).toBe(1);
      expect(summaryAccessor.get().itemCount).toBe(1);
      
      cleanup();
    });
  });

  describe("Async Operations", () => {
    it("should handle successful API calls with preset service", async () => {
      // Create a preset API service that returns test data
      const mockApiService = provide([apiController], ([apiCtl]) => ({
        fetchUser: async (id: string): Promise<User> => {
          apiCtl.setLoading(true);
          apiCtl.setError(null);
          
          try {
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const userData = {
              id,
              name: 'Test User',
              email: 'test@example.com',
              preferences: {
                theme: 'light' as const,
                notifications: true,
                language: 'en'
              }
            };
            
            apiCtl.setLastFetch(new Date());
            apiCtl.setLoading(false);
            
            return userData;
          } catch (error) {
            apiCtl.setError(error.message);
            apiCtl.setLoading(false);
            throw error;
          }
        }
      }));
      
      // Create scope with preset API
      const testScope = createScope(
        preset(store.userAPI, await scope.resolve(mockApiService))
      );
      
      try {
        const api = await testScope.resolve(store.userAPI);
        
        // Test loading state
        const statusBefore = await testScope.resolve(store.apiStatus);
        expect(statusBefore.loading).toBe(false);
        
        // Make API call
        const result = await api.fetchUser("123");
        
        // Check final state
        const statusAfter = await testScope.resolve(store.apiStatus);
        expect(statusAfter.loading).toBe(false);
        expect(statusAfter.error).toBe(null);
        expect(statusAfter.lastFetch).toBeInstanceOf(Date);
        expect(result.name).toBe("Test User");
      } finally {
        await testScope.dispose();
      }
    });
    
    it("should handle API errors with preset failing service", async () => {
      // Create a preset API service that fails
      const failingApiService = provide([apiController], ([apiCtl]) => ({
        fetchUser: async (id: string): Promise<User> => {
          apiCtl.setLoading(true);
          apiCtl.setError(null);
          
          try {
            await new Promise(resolve => setTimeout(resolve, 50));
            throw new Error('Network error');
          } catch (error) {
            apiCtl.setError(error.message);
            apiCtl.setLoading(false);
            throw error;
          }
        }
      }));
      
      const testScope = createScope(
        preset(store.userAPI, await scope.resolve(failingApiService))
      );
      
      try {
        const api = await testScope.resolve(store.userAPI);
        
        // Make failing API call
        await expect(api.fetchUser("123")).rejects.toThrow("Network error");
        
        // Check error state
        const status = await testScope.resolve(store.apiStatus);
        expect(status.loading).toBe(false);
        expect(status.error).toBe("Network error");
      } finally {
        await testScope.dispose();
      }
    });
  });

  describe("Scope Isolation", () => {
    it("should maintain separate state in different scopes with different presets", async () => {
      // Create two scopes with different preset data
      const scope1 = createScope(
        preset(store.user, {
          id: '1',
          name: 'Alice',
          email: 'alice@example.com',
          preferences: {
            theme: 'light' as const,
            notifications: true,
            language: 'en'
          }
        })
      );
      
      const scope2 = createScope(
        preset(store.user, {
          id: '2',
          name: 'Bob',
          email: 'bob@example.com',
          preferences: {
            theme: 'dark' as const,
            notifications: false,
            language: 'fr'
          }
        })
      );
      
      try {
        // Get controllers from different scopes
        const controller1 = await scope1.resolve(store.userController);
        const controller2 = await scope2.resolve(store.userController);
        
        // Update themes in both scopes
        await controller1.toggleTheme(); // Alice: light -> dark
        await controller2.toggleTheme(); // Bob: dark -> light
        
        // Verify isolation
        const user1 = await scope1.resolve(store.user);
        const user2 = await scope2.resolve(store.user);
        
        expect(user1.name).toBe("Alice");
        expect(user1.preferences.theme).toBe("dark");
        
        expect(user2.name).toBe("Bob");
        expect(user2.preferences.theme).toBe("light");
      } finally {
        await scope1.dispose();
        await scope2.dispose();
      }
    });
  });

  describe("Preset Testing", () => {
    it("should work with preset values", async () => {
      const presetUser = {
        id: "preset-user",
        name: "Preset User",
        email: "preset@example.com",
        preferences: {
          theme: 'dark' as const,
          notifications: false,
          language: 'es'
        }
      };
      
      const presetScope = createScope(preset(store.user, presetUser));
      
      try {
        const user = await presetScope.resolve(store.user);
        expect(user).toEqual(presetUser);
        
        const theme = await presetScope.resolve(store.userTheme);
        expect(theme.isDark).toBe(true);
      } finally {
        await presetScope.dispose();
      }
    });
  });

  describe("Performance Testing", () => {
    it("should handle many updates efficiently", async () => {
      const cartController = await scope.resolve(store.cartController);
      
      const startTime = performance.now();
      
      // Add many items
      for (let i = 0; i < 1000; i++) {
        await cartController.addItem({
          id: `item-${i}`,
          name: `Item ${i}`,
          price: Math.random() * 100,
          category: "test"
        }, 1);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // Less than 1 second
      
      const cart = await scope.resolve(store.cartItems);
      expect(cart).toHaveLength(1000);
    });
  });

  describe("Memory Management", () => {
    it("should clean up properly on scope disposal", async () => {
      const testScope = createScope();
      
      // Resolve some executors
      await testScope.resolve(store.userController);
      await testScope.resolve(store.cartController);
      
      // Dispose should not throw
      await expect(testScope.dispose()).resolves.not.toThrow();
      
      // Further operations should throw
      await expect(testScope.resolve(store.user)).rejects.toThrow();
    });
  });
});

// Helper functions for testing
export const testHelpers = {
  createMockProduct: (overrides: Partial<Product> = {}): Product => ({
    id: "mock-product",
    name: "Mock Product",
    price: 19.99,
    category: "test",
    ...overrides
  }),
  
  createTestScope: (presets: Core.Preset<unknown>[] = []) => {
    return createScope(...presets);
  },
  
  waitForReactiveUpdate: async (
    scope: Core.Scope,
    executor: Core.Executor<unknown>,
    timeout: number = 1000
  ) => {
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Reactive update timeout after ${timeout}ms`));
      }, timeout);
      
      const cleanup = scope.onUpdate(executor, () => {
        clearTimeout(timeoutId);
        cleanup();
        resolve();
      });
    });
  }
};