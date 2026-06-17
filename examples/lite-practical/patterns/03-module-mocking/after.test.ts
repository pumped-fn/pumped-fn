import { atom, createScope, preset, type Lite } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  mailer,
  sendWelcome,
  userDirectory,
  welcomeTemplate,
  type Mailer,
  type SentMail,
} from "./after"

function createMailerDouble(channel: string): Mailer {
  const outbox: SentMail[] = []

  return {
    outbox,
    async send(message) {
      const mail: SentMail = { ...message, id: `${channel}:${message.to}` }
      outbox.push(mail)
      return mail
    },
  }
}

function trackResolving() {
  const counts = { mailer: 0, users: 0, template: 0 }
  const extension: Lite.Extension = {
    name: "track-resolving",
    wrapResolve: async (next, event) => {
      if (event.target === mailer) counts.mailer += 1
      if (event.target === userDirectory) counts.users += 1
      if (event.target === welcomeTemplate) counts.template += 1
      return next()
    },
  }
  return { counts, extension }
}

describe("inside-out", () => {
  test("IO1: preset(atom, value) skips factory and serves value", async () => {
    const baselineResolving = trackResolving()
    const baseline = createScope({ extensions: [baselineResolving.extension] })
    const realMailer = await baseline.resolve(mailer)
    const realMail = await realMailer.send({
      to: "a@example.test",
      subject: "Hi",
      body: "Real",
    })
    expect(realMail.id).toBe("mail-1")
    expect(realMailer.outbox).toEqual([realMail])
    expect(baselineResolving.counts.mailer).toBe(1)

    const double = createMailerDouble("fake")
    const resolving = trackResolving()
    const scope = createScope({
      presets: [preset(mailer, double)],
      extensions: [resolving.extension],
    })
    let resolvedEvents = 0
    scope.on("resolved", mailer, () => {
      resolvedEvents += 1
    })

    expect(await scope.resolve(mailer)).toBe(double)
    expect(resolving.counts.mailer).toBe(0)
    expect(resolvedEvents).toBe(1)
  })

  test("IO2: preset(atom, otherAtom) redirect runs the redirected factory", async () => {
    let redirectedRuns = 0
    const redirectedMailer = atom({
      factory: () => {
        redirectedRuns += 1
        return createMailerDouble("redirected")
      },
    })
    const resolving = trackResolving()
    const scope = createScope({
      presets: [preset(mailer, redirectedMailer)],
      extensions: [resolving.extension],
    })

    const served = await scope.resolve(mailer)
    const mail = await served.send({
      to: "team@example.test",
      subject: "Hello",
      body: "Redirected",
    })

    expect(mail.id).toBe("redirected:team@example.test")
    expect(resolving.counts.mailer).toBe(0)
    expect(redirectedRuns).toBe(1)
    expect(served.outbox).toEqual([{
      to: "team@example.test",
      subject: "Hello",
      body: "Redirected",
      id: "redirected:team@example.test",
    }])
  })

  test("IO3: preset(flow, fn) replacement does not resolve flow deps [S3]", async () => {
    const baselineResolving = trackResolving()
    const baseline = createScope({ extensions: [baselineResolving.extension] })
    const baselineResult = await baseline.createContext().exec({
      flow: sendWelcome,
      input: { userId: "7" },
    })
    expect(baselineResult.receiptId).toBe("mail-1")
    expect(baselineResolving.counts).toEqual({ mailer: 1, users: 1, template: 1 })

    const resolving = trackResolving()
    const scope = createScope({
      presets: [
        preset(sendWelcome, (ctx) => ({
          deliveredTo: `preset-${ctx.input.userId}`,
          greeting: "preset-greeting",
          receiptId: "preset-receipt",
        })),
      ],
      extensions: [resolving.extension],
    })

    expect(await scope.createContext().exec({
      flow: sendWelcome,
      input: { userId: "7" },
    })).toEqual({
      deliveredTo: "preset-7",
      greeting: "preset-greeting",
      receiptId: "preset-receipt",
    })
    expect(resolving.counts).toEqual({ mailer: 0, users: 0, template: 0 })
  })

  test("IO4: two scopes use different presets without cross-test leakage", async () => {
    const alpha = createMailerDouble("alpha")
    const beta = createMailerDouble("beta")
    const alphaResolving = trackResolving()
    const betaResolving = trackResolving()
    const alphaScope = createScope({
      presets: [preset(mailer, alpha)],
      extensions: [alphaResolving.extension],
    })
    const betaScope = createScope({
      presets: [preset(mailer, beta)],
      extensions: [betaResolving.extension],
    })

    const alphaMailer = await alphaScope.resolve(mailer)
    const betaMailer = await betaScope.resolve(mailer)
    await alphaMailer.send({
      to: "alpha@example.test",
      subject: "A",
      body: "Scope A",
    })
    await betaMailer.send({
      to: "beta@example.test",
      subject: "B",
      body: "Scope B",
    })

    expect(alpha.outbox.map((mail) => mail.id)).toEqual(["alpha:alpha@example.test"])
    expect(beta.outbox.map((mail) => mail.id)).toEqual(["beta:beta@example.test"])
    expect(alphaResolving.counts.mailer).toBe(0)
    expect(betaResolving.counts.mailer).toBe(0)
  })
})

describe("outside-in", () => {
  test("OI1: send-welcome flow presets only mailer at the edge", async () => {
    const edgeMailer = createMailerDouble("edge")
    const resolving = trackResolving()
    const scope = createScope({
      presets: [preset(mailer, edgeMailer)],
      extensions: [resolving.extension],
    })

    const result = await scope.createContext().exec({
      flow: sendWelcome,
      input: { userId: "42" },
    })

    expect(result).toEqual({
      deliveredTo: "user-42@example.test",
      greeting: "Welcome, User 42",
      receiptId: "edge:user-42@example.test",
    })
    expect(edgeMailer.outbox).toEqual([{
      to: "user-42@example.test",
      subject: "Welcome, User 42",
      body: "Your workspace is ready.",
      id: "edge:user-42@example.test",
    }])
    expect(resolving.counts).toEqual({ mailer: 0, users: 1, template: 1 })
  })
})
