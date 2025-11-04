/**
 * @file state.oauth-tokens.ts
 * OAuth tokens state - session-scoped authentication
 *
 * Demonstrates:
 * - State with structured data
 * - .static controller for mutations
 * - Resource dependency on state
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 */

import { provide, derive } from '@pumped-fn/core-next'

export namespace OAuthTokens {
  export type Tokens = {
    accessToken: string | null
    refreshToken: string | null
    expiresAt: number | null
  }
}

const initialTokens: OAuthTokens.Tokens = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null
}

export const oauthTokens = provide(() => initialTokens)

export const oauthTokensCtl = derive(oauthTokens.static, (ctl) => {
  return {
    get: (): OAuthTokens.Tokens => ctl.get(),

    set: (tokens: OAuthTokens.Tokens): void => {
      ctl.set(tokens)
    },

    clear: (): void => {
      ctl.set(initialTokens)
    },

    isExpired: (): boolean => {
      const tokens = ctl.get()
      if (!tokens.expiresAt) return true
      return Date.now() >= tokens.expiresAt
    }
  }
})
