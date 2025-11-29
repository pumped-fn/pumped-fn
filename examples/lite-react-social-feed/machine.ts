/**
 * Central Machine Configuration
 *
 * The machine is the single source of truth for:
 * - What atoms exist in the state graph
 * - What events can occur
 * - What state transitions are valid
 * - Which atoms to invalidate for each event
 *
 * Benefits over decentralized reactivity:
 * 1. All state transitions in one place (easy to understand)
 * 2. Explicit event → invalidation mapping (predictable)
 * 3. State machine for UI transitions (loading, error, etc.)
 * 4. Mutations with optimistic updates (centralized)
 */

import { machine, createMachine } from "@pumped-fn/lite-react"
import { createScope } from "@pumped-fn/lite"
import { atoms, type Atoms } from "./atoms"
import { mutations, type Mutations } from "./mutations"
import { api } from "./api"

/**
 * Event types that the machine handles
 */
export interface AppEvents {
  LOGIN: { email: string; password: string }
  LOGOUT: void
  REFRESH: void
  LIKE: { postId: string }
  UNLIKE: { postId: string }
  CREATE_POST: { content: string; imageUrl?: string }
  DELETE_POST: { postId: string }
  MARK_NOTIFICATIONS_READ: { ids: string[] }
  MARK_ALL_NOTIFICATIONS_READ: void
  UPDATE_SETTINGS: { theme?: "light" | "dark"; notifications?: boolean }
  UPDATE_FORM: { field: "content" | "imageUrl"; value: string }
  SUBMIT_FORM: void
  RESET_FORM: void
}

/**
 * Machine states for UI transitions
 */
export type AppState =
  | "anonymous"
  | "authenticating"
  | "authenticated"
  | "refreshing"
  | "submitting"
  | "error"

/**
 * Machine configuration
 *
 * This defines the entire state management behavior of the app.
 */
export const appMachineConfig = machine<Atoms, AppEvents, AppState>({
  atoms,
  mutations,

  initial: "anonymous",

  states: {
    anonymous: {
      on: {
        LOGIN: "authenticating",
      },
    },

    authenticating: {
      entry: async (ctx) => {
        try {
          const { email, password } = ctx.payload as AppEvents["LOGIN"]
          await api.login({ email, password })
          ctx.invalidate("user", "posts", "notifications")
          ctx.send("AUTH_SUCCESS")
        } catch (error) {
          ctx.send("AUTH_FAILURE", { error })
        }
      },
      on: {
        AUTH_SUCCESS: "authenticated",
        AUTH_FAILURE: "anonymous",
      },
    },

    authenticated: {
      on: {
        LOGOUT: {
          target: "anonymous",
          action: async (ctx) => {
            await api.logout()
            ctx.invalidateAll()
          },
        },

        REFRESH: "refreshing",

        LIKE: {
          action: (ctx, { postId }) => {
            ctx.send("LIKE", { postId })
          },
        },

        UNLIKE: {
          action: (ctx, { postId }) => {
            ctx.send("UNLIKE", { postId })
          },
        },

        DELETE_POST: {
          action: (ctx, { postId }) => {
            ctx.send("DELETE_POST", { postId })
          },
        },

        MARK_NOTIFICATIONS_READ: {
          action: (ctx, { ids }) => {
            ctx.send("MARK_NOTIFICATIONS_READ", { ids })
          },
        },

        MARK_ALL_NOTIFICATIONS_READ: {
          action: (ctx) => {
            ctx.send("MARK_ALL_NOTIFICATIONS_READ")
          },
        },

        UPDATE_SETTINGS: {
          action: (ctx, settings) => {
            ctx.send("UPDATE_SETTINGS", settings)
          },
        },

        SUBMIT_FORM: "submitting",
      },
    },

    refreshing: {
      entry: async (ctx) => {
        try {
          ctx.invalidate("posts", "notifications")
          await Promise.all([
            ctx.scope.resolve(atoms.posts),
            ctx.scope.resolve(atoms.notifications),
          ])
          ctx.send("REFRESH_SUCCESS")
        } catch {
          ctx.send("REFRESH_FAILURE")
        }
      },
      on: {
        REFRESH_SUCCESS: "authenticated",
        REFRESH_FAILURE: "authenticated",
      },
    },

    submitting: {
      entry: async (ctx) => {
        try {
          const form = await ctx.scope.resolve(atoms.postForm)
          if (!form.content.trim()) {
            ctx.send("VALIDATION_FAILURE", { error: "Content is required" })
            return
          }

          await ctx.scope.resolve(atoms.posts)
          ctx.send("CREATE_POST", { content: form.content, imageUrl: form.imageUrl })
          ctx.send("SUBMIT_SUCCESS")
        } catch (error) {
          ctx.send("SUBMIT_FAILURE", { error })
        }
      },
      on: {
        SUBMIT_SUCCESS: {
          target: "authenticated",
          action: (ctx) => {
            ctx.invalidate("postForm")
          },
        },
        SUBMIT_FAILURE: "authenticated",
        VALIDATION_FAILURE: "authenticated",
      },
    },

    error: {
      on: {
        RETRY: "authenticated",
        LOGOUT: "anonymous",
      },
    },
  },

  on: {
    UPDATE_FORM: (ctx, { field, value }) => {
      ctx.invalidate("postForm")
    },

    RESET_FORM: (ctx) => {
      ctx.invalidate("postForm")
    },
  },
})

/**
 * Create and initialize the machine
 *
 * This is called at app startup to create the machine instance.
 */
export async function initializeMachine() {
  const scope = await createScope()
  const appMachine = await createMachine(appMachineConfig, { scope })
  return appMachine
}

/**
 * Machine type for use in components
 */
export type AppMachine = Awaited<ReturnType<typeof initializeMachine>>
