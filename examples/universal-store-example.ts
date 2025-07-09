/**
 * Universal Store Example
 * 
 * This demonstrates how to create a completely framework-agnostic store
 * using Pumped Functions that can work with React, Vue, Svelte, or any
 * other framework through different adapters.
 */

import { provide, derive, createScope, preset } from "@pumped-fn/core-next";
import type { Core } from "@pumped-fn/core-next";

// ===== DOMAIN TYPES =====
type AppTheme = 'light' | 'dark' | 'auto';

type NotificationLevel = 'none' | 'essential' | 'all';

type UserPreferences = {
  theme: AppTheme;
  language: string;
  notifications: NotificationLevel;
  fontSize: number;
};

type AppSettings = {
  apiBaseUrl: string;
  enableAnalytics: boolean;
  maxRetries: number;
  timeout: number;
};

type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  tags: string[];
};

type AppState = {
  user: {
    id: string;
    name: string;
    email: string;
    preferences: UserPreferences;
  };
  todos: TodoItem[];
  settings: AppSettings;
  ui: {
    sidebarOpen: boolean;
    loading: boolean;
    error: string | null;
    activeModal: string | null;
  };
};

// ===== STORE DEFINITION =====

// State atoms
const userState = provide((): AppState['user'] => ({
  id: 'anonymous',
  name: 'Anonymous User',
  email: '',
  preferences: {
    theme: 'auto',
    language: 'en',
    notifications: 'essential',
    fontSize: 14
  }
}));

const todosState = provide((): TodoItem[] => []);

const settingsState = provide((): AppSettings => ({
  apiBaseUrl: '/api',
  enableAnalytics: false,
  maxRetries: 3,
  timeout: 5000
}));

const uiState = provide((): AppState['ui'] => ({
  sidebarOpen: false,
  loading: false,
  error: null,
  activeModal: null
}));

// ID generator service
const idGenerator = provide(() => {
  let counter = 0;
  return () => `id_${Date.now()}_${++counter}`;
});

// ===== CONTROLLERS =====

const userController = derive(userState.static, (userCtl) => ({
  updateProfile: (updates: Partial<Pick<AppState['user'], 'name' | 'email'>>) =>
    userCtl.update(current => ({ ...current, ...updates })),
  
  updatePreferences: (preferences: Partial<UserPreferences>) =>
    userCtl.update(current => ({
      ...current,
      preferences: { ...current.preferences, ...preferences }
    })),
  
  setTheme: (theme: AppTheme) =>
    userCtl.update(current => ({
      ...current,
      preferences: { ...current.preferences, theme }
    })),
  
  setLanguage: (language: string) =>
    userCtl.update(current => ({
      ...current,
      preferences: { ...current.preferences, language }
    })),
  
  setFontSize: (fontSize: number) =>
    userCtl.update(current => ({
      ...current,
      preferences: { ...current.preferences, fontSize }
    }))
}));

const todosController = derive(
  [todosState.static, idGenerator], 
  ([todosCtl, generateId]) => ({
    addTodo: (todo: Omit<TodoItem, 'id'>) =>
      todosCtl.update(current => [
        ...current,
        { ...todo, id: generateId() }
      ]),
    
    updateTodo: (id: string, updates: Partial<TodoItem>) =>
      todosCtl.update(current =>
        current.map(todo =>
          todo.id === id ? { ...todo, ...updates } : todo
        )
      ),
    
    deleteTodo: (id: string) =>
      todosCtl.update(current => current.filter(todo => todo.id !== id)),
    
    toggleComplete: (id: string) =>
      todosCtl.update(current =>
        current.map(todo =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo
        )
      ),
    
    clearCompleted: () =>
      todosCtl.update(current => current.filter(todo => !todo.completed)),
    
    reorderTodos: (startIndex: number, endIndex: number) =>
      todosCtl.update(current => {
        const result = Array.from(current);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
      })
  })
);

const settingsController = derive(settingsState.static, (settingsCtl) => ({
  updateSettings: (updates: Partial<AppSettings>) =>
    settingsCtl.update(current => ({ ...current, ...updates })),
  
  resetToDefaults: () =>
    settingsCtl.update({
      apiBaseUrl: '/api',
      enableAnalytics: false,
      maxRetries: 3,
      timeout: 5000
    })
}));

const uiController = derive(uiState.static, (uiCtl) => ({
  setLoading: (loading: boolean) =>
    uiCtl.update(current => ({ ...current, loading })),
  
  setError: (error: string | null) =>
    uiCtl.update(current => ({ ...current, error })),
  
  toggleSidebar: () =>
    uiCtl.update(current => ({ ...current, sidebarOpen: !current.sidebarOpen })),
  
  openModal: (modalName: string) =>
    uiCtl.update(current => ({ ...current, activeModal: modalName })),
  
  closeModal: () =>
    uiCtl.update(current => ({ ...current, activeModal: null }))
}));

// ===== DERIVED STATE =====

const todoStats = derive(todosState.reactive, (todos) => {
  const completed = todos.filter(todo => todo.completed).length;
  const total = todos.length;
  const remaining = total - completed;
  
  const byPriority = todos.reduce((acc, todo) => {
    acc[todo.priority] = (acc[todo.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    total,
    completed,
    remaining,
    completionRate: total > 0 ? (completed / total) * 100 : 0,
    byPriority
  };
});

const filteredTodos = derive(todosState.reactive, (todos) => ({
  all: todos,
  active: todos.filter(todo => !todo.completed),
  completed: todos.filter(todo => todo.completed),
  highPriority: todos.filter(todo => todo.priority === 'high'),
  overdue: todos.filter(todo => 
    todo.dueDate && todo.dueDate < new Date() && !todo.completed
  )
}));

const themeConfig = derive(userState.reactive, (user) => {
  const { theme } = user.preferences;
  
  let resolvedTheme: 'light' | 'dark';
  if (theme === 'auto') {
    resolvedTheme = window?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    resolvedTheme = theme;
  }
  
  return {
    theme: resolvedTheme,
    isDark: resolvedTheme === 'dark',
    cssVariables: {
      '--bg-color': resolvedTheme === 'dark' ? '#1a1a1a' : '#ffffff',
      '--text-color': resolvedTheme === 'dark' ? '#ffffff' : '#000000',
      '--border-color': resolvedTheme === 'dark' ? '#333333' : '#e0e0e0',
      '--font-size': `${user.preferences.fontSize}px`
    }
  };
});

// ===== SERVICES =====

const apiService = derive(
  [settingsState.reactive, uiController],
  ([settings, uiCtl]) => ({
    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
      const url = `${settings.apiBaseUrl}${endpoint}`;
      
      uiCtl.setLoading(true);
      uiCtl.setError(null);
      
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        uiCtl.setLoading(false);
        return data;
      } catch (error) {
        uiCtl.setError(error.message);
        uiCtl.setLoading(false);
        throw error;
      }
    },
    
    async get<T>(endpoint: string): Promise<T> {
      return this.request<T>(endpoint);
    },
    
    async post<T>(endpoint: string, data: unknown): Promise<T> {
      return this.request<T>(endpoint, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    async put<T>(endpoint: string, data: unknown): Promise<T> {
      return this.request<T>(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    
    async delete<T>(endpoint: string): Promise<T> {
      return this.request<T>(endpoint, {
        method: 'DELETE'
      });
    }
  })
);

const persistenceService = derive(
  [userState.reactive, todosState.reactive, settingsState.reactive],
  ([user, todos, settings]) => ({
    async saveToStorage() {
      try {
        const state = { user, todos, settings };
        localStorage.setItem('appState', JSON.stringify(state));
      } catch (error) {
        console.error('Failed to save state:', error);
      }
    },
    
    async loadFromStorage() {
      try {
        const stored = localStorage.getItem('appState');
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.error('Failed to load state:', error);
      }
      return null;
    },
    
    async clearStorage() {
      try {
        localStorage.removeItem('appState');
      } catch (error) {
        console.error('Failed to clear state:', error);
      }
    }
  })
);

// ===== STORE EXPORT =====

export const universalStore = {
  // State
  user: userState,
  todos: todosState,
  settings: settingsState,
  ui: uiState,
  
  // Controllers
  userController,
  todosController,
  settingsController,
  uiController,
  
  // Derived State
  todoStats,
  filteredTodos,
  themeConfig,
  
  // Services
  apiService,
  persistenceService,
  
  // Utilities
  idGenerator
};

// ===== FRAMEWORK ADAPTERS =====

// React Adapter
export const createReactAdapter = (scope: Core.Scope) => {
  return {
    useStore: <T>(executor: Core.Executor<T>) => {
      // This would integrate with useResolves from @pumped-fn/react
      // return useResolves(executor.reactive)[0];
      return scope.resolve(executor); // Simplified for example
    },
    
    useController: <T>(executor: Core.Executor<T>) => {
      // return useResolves(executor)[0];
      return scope.resolve(executor); // Simplified for example
    }
  };
};

// Vue Adapter
export const createVueAdapter = (scope: Core.Scope) => {
  return {
    useStore: <T>(executor: Core.Executor<T>) => {
      // This would integrate with Vue's reactivity system
      // Using Vue's ref/reactive and watchEffect
      return scope.resolve(executor);
    }
  };
};

// Svelte Adapter
export const createSvelteAdapter = (scope: Core.Scope) => {
  return {
    useStore: <T>(executor: Core.Executor<T>) => {
      // This would integrate with Svelte stores
      // Using writable/readable stores
      return scope.resolve(executor);
    }
  };
};

// ===== USAGE EXAMPLES =====

// Creating a store instance
export const createAppStore = (initialState?: Partial<AppState>) => {
  const presets: Core.Preset<unknown>[] = [];
  
  if (initialState?.user) {
    presets.push(preset(universalStore.user, initialState.user));
  }
  if (initialState?.todos) {
    presets.push(preset(universalStore.todos, initialState.todos));
  }
  if (initialState?.settings) {
    presets.push(preset(universalStore.settings, initialState.settings));
  }
  if (initialState?.ui) {
    presets.push(preset(universalStore.ui, initialState.ui));
  }
  
  return createScope(...presets);
};

// Application lifecycle
export const createAppLifecycle = (scope: Core.Scope) => ({
  async initialize() {
    // Load persisted state
    const persistence = await scope.resolve(universalStore.persistenceService);
    const stored = await persistence.loadFromStorage();
    
    if (stored) {
      // Apply stored state using controllers
      const userCtl = await scope.resolve(universalStore.userController);
      const todosCtl = await scope.resolve(universalStore.todosController);
      const settingsCtl = await scope.resolve(universalStore.settingsController);
      
      await userCtl.updateProfile(stored.user);
      // Note: This is simplified - you'd want to replace entire state
    }
  },
  
  async shutdown() {
    // Save current state
    const persistence = await scope.resolve(universalStore.persistenceService);
    await persistence.saveToStorage();
    
    // Dispose scope
    await scope.dispose();
  }
});

// Example usage with React
export const useAppStore = () => {
  const scope = createAppStore();
  const adapter = createReactAdapter(scope);
  
  return {
    // State
    user: adapter.useStore(universalStore.user),
    todos: adapter.useStore(universalStore.todos),
    ui: adapter.useStore(universalStore.ui),
    
    // Controllers
    userController: adapter.useController(universalStore.userController),
    todosController: adapter.useController(universalStore.todosController),
    uiController: adapter.useController(universalStore.uiController),
    
    // Derived
    todoStats: adapter.useStore(universalStore.todoStats),
    themeConfig: adapter.useStore(universalStore.themeConfig),
    
    // Cleanup
    dispose: () => scope.dispose()
  };
};

// Testing utilities
export const createTestStore = (initialState?: Partial<AppState>) => {
  const scope = createAppStore(initialState);
  
  return {
    scope,
    
    // Helper methods for testing
    async getUserController() {
      return scope.resolve(universalStore.userController);
    },
    
    async getTodosController() {
      return scope.resolve(universalStore.todosController);
    },
    
    async getState() {
      const [user, todos, settings, ui] = await Promise.all([
        scope.resolve(universalStore.user),
        scope.resolve(universalStore.todos),
        scope.resolve(universalStore.settings),
        scope.resolve(universalStore.ui)
      ]);
      
      return { user, todos, settings, ui };
    },
    
    async dispose() {
      await scope.dispose();
    }
  };
};