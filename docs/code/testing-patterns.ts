import { provide, derive, createScope, preset } from "@pumped-fn/core-next"
import { describe, it, expect, vi } from "vitest"

// #region preset-mock-basic
// [!code --:2]
import { provide as p1, derive as d1, createScope as cs1, preset as ps1 } from "@pumped-fn/core-next"

const database = provide(() => ({
  createUser: async (user: { name: string }) => ({ id: "real-id", ...user })
}))

const userService = derive([database], ([db]) => ({
  create: async (input: { name: string }) => {
    return db.createUser(input)
  }
}))

const mockDB = { createUser: vi.fn().mockResolvedValue({ id: "1" }) }
const testScope = createScope(
  preset(database, mockDB)
)

const service = await testScope.resolve(userService)
const result = await service.create({ name: "Test" })
// [!code --:4]

describe("preset basic", () => {
  it("should mock database", async () => {
    expect(result.id).toBe("1")
    expect(mockDB.createUser).toHaveBeenCalledWith({ name: "Test" })
    await testScope.dispose()
  })
})
// #endregion preset-mock-basic

// #region preset-multiple
// [!code --:3]
import { provide as p2, derive as d2, createScope as cs2, preset as ps2 } from "@pumped-fn/core-next"
import { vi as vi2 } from "vitest"

const logger = provide(() => ({ info: (msg: string) => console.log(msg) }))
const emailService = provide(() => ({
  send: async (to: string, body: string) => { /* real send */ }
}))

const userSignup = derive([database, logger, emailService], ([db, log, email]) => ({
  signup: async (user: { email: string; name: string }) => {
    await db.createUser(user)
    log.info(`User created: ${user.email}`)
    await email.send(user.email, "Welcome!")
  }
}))

const mockLog = { info: vi2.fn() }
const mockEmail = { send: vi2.fn() }
const mockDB2 = { createUser: vi2.fn().mockResolvedValue({ id: "2" }) }

const testScope2 = createScope(
  preset(database, mockDB2),
  preset(logger, mockLog),
  preset(emailService, mockEmail)
)

const signup = await testScope2.resolve(userSignup)
await signup.signup({ email: "test@example.com", name: "Test" })
// [!code --:7]

describe("preset multiple", () => {
  it("should mock multiple dependencies", async () => {
    expect(mockDB2.createUser).toHaveBeenCalled()
    expect(mockLog.info).toHaveBeenCalled()
    expect(mockEmail.send).toHaveBeenCalledWith("test@example.com", "Welcome!")
    await testScope2.dispose()
  })
})
// #endregion preset-multiple
