import { ParseError, createScope } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  appConfig,
  configSummary,
  logLevel,
  requestConfig,
} from "./after"

describe("inside-out", () => {
  test("IO1: valid value -> typed config inside factory", async () => {
    const scope = createScope({
      tags: [appConfig({ baseUrl: "https://api.example.test", port: 8080 })],
    })

    await expect(scope.resolve(configSummary)).resolves.toEqual({
      endpoint: "https://api.example.test:8080",
      logLevel: "info",
    })
  })

  test("IO2: invalid value -> ParseError at appConfig(bad) creation, phase==='tag', label preserved", () => {
    const invalidValues = [
      "PORT=abc",
      null,
      { baseUrl: "https://api.example.test", port: "8080" },
      { baseUrl: 42, port: 8080 },
      { baseUrl: "http://api.example.test", port: 8080 },
    ]

    for (const invalidValue of invalidValues) {
      let thrown: unknown
      try {
        appConfig(invalidValue as never)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(ParseError)
      expect((thrown as ParseError).phase).toBe("tag")
      expect((thrown as ParseError).label).toBe("app.config")
    }
  })

  test("IO3: tag-with-default: absent -> default branch; present -> value branch", async () => {
    const defaultScope = createScope({
      tags: [appConfig({ baseUrl: "https://api.example.test", port: 3000 })],
    })
    const debugScope = createScope({
      tags: [
        appConfig({ baseUrl: "https://api.example.test", port: 3000 }),
        logLevel("debug"),
      ],
    })

    await expect(defaultScope.resolve(configSummary)).resolves.toMatchObject({
      logLevel: "info",
    })
    await expect(debugScope.resolve(configSummary)).resolves.toMatchObject({
      logLevel: "debug",
    })
  })
})

describe("outside-in", () => {
  test("OI1: scope-level tag reaches atom deps; context-level tag reaches flow deps (two visibility planes)", async () => {
    const atomScope = createScope({
      tags: [appConfig({ baseUrl: "https://atom.example.test", port: 9001 })],
    })
    const flowScope = createScope()
    const flowCtx = flowScope.createContext({
      tags: [appConfig({ baseUrl: "https://flow.example.test", port: 9002 })],
    })

    await expect(atomScope.resolve(configSummary)).resolves.toEqual({
      endpoint: "https://atom.example.test:9001",
      logLevel: "info",
    })
    await expect(flowCtx.exec({ flow: requestConfig })).resolves.toEqual({
      endpoint: "https://flow.example.test:9002",
    })
  })
})
