import { cac } from "cac"
import { createMemoryStore } from "@pumped-fn/parking-lot-shared"
import { book, checkIn, configure, exit, fail, pay, report, type Runtime } from "./commands"

const database = createMemoryStore()

function runtime(role: Runtime["actor"]["role"], id = `${role}-cli`): Runtime {
  return {
    actor: { id, role },
    at: new Date().toISOString(),
    store: database,
  }
}

export function createCli() {
  const cli = cac("parking-lot")
  cli.command("configure <name>", "configure a lot").action(async (name: string) => {
    console.log(await configure(runtime("manager"), {
      bookingLeadMinutes: 120,
      capacity: 60,
      currency: "USD",
      graceMinutes: 10,
      name,
      rateCentsPerHour: 500,
      refundWindowMinutes: 1440,
    }))
  })
  cli.command("book <lotId> <plate>", "book a parking slot").action(async (lotId: string, plate: string) => {
    console.log(await book(runtime("user", "cli-user"), {
      endAt: "2026-07-01T12:00:00.000Z",
      lotId,
      plate,
      startAt: "2026-07-01T10:00:00.000Z",
    }))
  })
  cli.command("check-in <lotId> <plate>", "check in a drive-up vehicle").action(async (lotId: string, plate: string) => {
    console.log(await checkIn(runtime("operator"), { lotId, plate, userId: "cli-user" }))
  })
  cli.command("exit <sessionId>", "prepare a vehicle exit").action(async (sessionId: string) => {
    console.log(await exit(runtime("operator"), { sessionId }))
  })
  cli.command("pay <paymentId> <externalRef>", "pair a payment").action(async (paymentId: string, externalRef: string) => {
    console.log(await pay(runtime("operator"), { externalRef, method: "card", paymentId }))
  })
  cli.command("fail <paymentId> <reason>", "record payment failure").action(async (paymentId: string, reason: string) => {
    console.log(await fail(runtime("operator"), { paymentId, reason }))
  })
  cli.command("report", "read manager report").action(async () => {
    console.log(await report(runtime("manager"), {}))
  })
  return cli
}
