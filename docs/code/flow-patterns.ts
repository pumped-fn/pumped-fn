import { flow, provide, createScope } from "@pumped-fn/core-next"
import { describe, it, expect } from "vitest"
import { custom } from "@pumped-fn/core-next/ssch"

// #region flow-basic
// [!code --:2]
import { flow as f1, createScope as cs1 } from "@pumped-fn/core-next"

const doubleFlow = flow((_ctx, input: number) => input * 2)

const scope = createScope()
const result = await scope.exec(doubleFlow, 5)
console.log(result) // 10
// [!code --:5]

describe("basic flow", () => {
  it("executes transformation", async () => {
    expect(result).toBe(10)
    await scope.dispose()
  })
})
// #endregion flow-basic

// #region flow-with-deps
// [!code --:3]
import { flow as f2, provide as p2, createScope as cs2 } from "@pumped-fn/core-next"

const config = provide(() => ({ multiplier: 3 }))

const multiplyFlow = flow(config, (cfg, _ctx, input: number) => {
  return input * cfg.multiplier
})

const scope2 = createScope()
const result2 = await scope2.exec(multiplyFlow, 5)
console.log(result2) // 15
// [!code --:6]

describe("flow with dependencies", () => {
  it("injects dependencies", async () => {
    expect(result2).toBe(15)
    await scope2.dispose()
  })
})
// #endregion flow-with-deps

// #region flow-context
// [!code --:3]
import { flow as f3, provide as p3, createScope as cs3 } from "@pumped-fn/core-next"

const apiService = provide(() => ({
  fetch: async (url: string) => ({ data: `from ${url}` })
}))

const fetchUser = flow(apiService, async (api, ctx, userId: number) => {
  const response = await ctx.run("fetch-user", () =>
    api.fetch(`/users/${userId}`)
  )
  return { userId, username: `user${userId}`, raw: response.data }
})

const getUserWithPosts = flow(apiService, async (api, ctx, userId: number) => {
  const user = await ctx.exec(fetchUser, userId)
  const posts = await ctx.run("fetch-posts", () =>
    api.fetch(`/posts?userId=${userId}`)
  )
  return { ...user, postCount: 1 }
})

const scope3 = createScope()
const result3 = await scope3.exec(getUserWithPosts, 42)
console.log(result3) // { userId: 42, username: 'user42', raw: 'from /users/42', postCount: 1 }
// [!code --:11]

describe("flow with context", () => {
  it("uses context for sub-flows and operations", async () => {
    expect(result3.userId).toBe(42)
    expect(result3.username).toBe("user42")
    expect(result3.postCount).toBe(1)
    await scope3.dispose()
  })
})
// #endregion flow-context
