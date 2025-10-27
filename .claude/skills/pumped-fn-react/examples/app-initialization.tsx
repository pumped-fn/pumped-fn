// App Initialization Example
// Shows proper scope creation and React app bootstrap

import React from 'react'
import ReactDOM from 'react-dom/client'
import { createScope } from '@pumped-fn/core-next'
import { ScopeProvider } from '@pumped-fn/react'
import { apiBaseUrl, authToken, apiClient } from './resource-layer'

// ===== Create app scope with configuration =====
export const appScope = createScope({
  tags: [
    apiBaseUrl(import.meta.env.VITE_API_URL || 'http://localhost:3000'),
    authToken(localStorage.getItem('auth_token'))
  ]
})

// ===== Initialize app with scope.run() =====
appScope.run(async () => {
  // Optionally resolve critical resources before rendering
  const api = await appScope.resolve(apiClient)

  console.log('API client initialized:', api)

  // Render React app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ScopeProvider scope={appScope}>
        <App />
      </ScopeProvider>
    </React.StrictMode>
  )
})

// ===== App component =====
function App() {
  return (
    <div className="app">
      <Header />
      <main>
        <Routes />
      </main>
    </div>
  )
}

function Header() {
  return (
    <header>
      <h1>My App</h1>
      <UserBadge />
    </header>
  )
}

function Routes() {
  // Router implementation
  return <div>Routes here</div>
}

function UserBadge() {
  // Defined in ui-components.tsx
  return <div>User</div>
}

// ===== Cleanup on unload =====
window.addEventListener('beforeunload', () => {
  appScope.dispose()
})
