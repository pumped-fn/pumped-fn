import { createScope, preset } from "@pumped-fn/lite"
import { hono } from "@pumped-fn/lite-hono"
import {
  actor,
  bookSpace,
  checkInVehicle,
  configureLot,
  now,
  pairPayment,
  prepareExit,
  readReport,
  store,
  type Actor,
  type ParkingStore,
  type Role,
} from "@pumped-fn/parking-lot-shared"
import { Hono } from "hono"

export interface Runtime {
  at: string | (() => string)
  store: ParkingStore
}

export function createApp(runtime: Runtime) {
  const lite = hono.adapter()
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    extensions: [lite],
  })
  const app = new Hono<hono.Env>()

  app.use("*", lite.middleware({
    tags: (request) => [
      actor(readActor(request.headers.get("x-actor-id") ?? undefined, request.headers.get("x-role") ?? undefined)),
      now(() => readAt(runtime)),
    ],
  }))
  app.post("/lots", async (context) => context.json(await context.var.lite.exec({
    flow: configureLot,
    rawInput: await context.req.json(),
  })))
  app.post("/bookings", async (context) => context.json(await context.var.lite.exec({
    flow: bookSpace,
    rawInput: await context.req.json(),
  })))
  app.post("/check-ins", async (context) => context.json(await context.var.lite.exec({
    flow: checkInVehicle,
    rawInput: await context.req.json(),
  })))
  app.post("/exits", async (context) => context.json(await context.var.lite.exec({
    flow: prepareExit,
    rawInput: await context.req.json(),
  })))
  app.post("/payments/pair", async (context) => context.json(await context.var.lite.exec({
    flow: pairPayment,
    rawInput: await context.req.json(),
  })))
  app.post("/reports", async (context) => context.json(await context.var.lite.exec({
    flow: readReport,
    rawInput: await context.req.json(),
  })))

  return { app, scope }
}

function readActor(id: string | undefined, role: string | undefined): Actor {
  return {
    id: id ?? "anonymous",
    role: readRole(role),
  }
}

function readAt(runtime: Runtime): string {
  return typeof runtime.at === "string" ? runtime.at : runtime.at()
}

function readRole(value: string | undefined): Role {
  if (value === "manager" || value === "operator" || value === "user") return value
  throw new Error(`unknown role: ${value ?? "missing"}`)
}
