import { provide, derive } from '@pumped-fn/core-next'

type Tokens = { accessToken: string | null; expiresAt: number | null }

const oauthTokens = provide(() => ({ accessToken: null, expiresAt: null } as Tokens))

export const oauthTokensCtl = derive(oauthTokens.static, (ctl) => ({
  get: () => ctl.get(),
  set: (tokens: Tokens) => ctl.set(tokens),
  isExpired: () => {
    const { expiresAt } = ctl.get()
    return !expiresAt || Date.now() >= expiresAt
  }
}))
