import { provide, derive } from '@pumped-fn/core-next'

const oauthTokens = provide(() => ({ accessToken: null as string | null }))

export const oauthTokensCtl = derive(oauthTokens.static, (ctl) => ({
  get: () => ctl.get(),
  set: (token: string) => ctl.set({ accessToken: token })
}))
