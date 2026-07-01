import { createScope, preset } from "@pumped-fn/lite"
import {
  actor,
  bookSpace,
  checkInVehicle,
  configureLot,
  now,
  pairPayment,
  prepareExit,
  readReport,
  recordPaymentFailure,
  store,
  type Actor,
  type BookSpaceInput,
  type CheckInVehicleInput,
  type ConfigureLotInput,
  type PairPaymentInput,
  type ParkingStore,
  type PrepareExitInput,
  type ReadReportInput,
  type RecordPaymentFailureInput,
} from "@pumped-fn/parking-lot-shared"

export interface Runtime {
  actor: Actor
  at: string
  store: ParkingStore
}

export async function configure(runtime: Runtime, input: ConfigureLotInput) {
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    tags: [actor(runtime.actor), now(() => runtime.at)],
  })
  const ctx = scope.createContext()
  const output = await ctx.exec({ flow: configureLot, input })
  await ctx.close({ ok: true })
  await scope.dispose()
  return output
}

export async function book(runtime: Runtime, input: BookSpaceInput) {
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    tags: [actor(runtime.actor), now(() => runtime.at)],
  })
  const ctx = scope.createContext()
  const output = await ctx.exec({ flow: bookSpace, input })
  await ctx.close({ ok: true })
  await scope.dispose()
  return output
}

export async function checkIn(runtime: Runtime, input: CheckInVehicleInput) {
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    tags: [actor(runtime.actor), now(() => runtime.at)],
  })
  const ctx = scope.createContext()
  const output = await ctx.exec({ flow: checkInVehicle, input })
  await ctx.close({ ok: true })
  await scope.dispose()
  return output
}

export async function exit(runtime: Runtime, input: PrepareExitInput) {
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    tags: [actor(runtime.actor), now(() => runtime.at)],
  })
  const ctx = scope.createContext()
  const output = await ctx.exec({ flow: prepareExit, input })
  await ctx.close({ ok: true })
  await scope.dispose()
  return output
}

export async function pay(runtime: Runtime, input: PairPaymentInput) {
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    tags: [actor(runtime.actor), now(() => runtime.at)],
  })
  const ctx = scope.createContext()
  const output = await ctx.exec({ flow: pairPayment, input })
  await ctx.close({ ok: true })
  await scope.dispose()
  return output
}

export async function fail(runtime: Runtime, input: RecordPaymentFailureInput) {
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    tags: [actor(runtime.actor), now(() => runtime.at)],
  })
  const ctx = scope.createContext()
  const output = await ctx.exec({ flow: recordPaymentFailure, input })
  await ctx.close({ ok: true })
  await scope.dispose()
  return output
}

export async function report(runtime: Runtime, input: ReadReportInput) {
  const scope = createScope({
    presets: [preset(store, runtime.store)],
    tags: [actor(runtime.actor), now(() => runtime.at)],
  })
  const ctx = scope.createContext()
  const output = await ctx.exec({ flow: readReport, input })
  await ctx.close({ ok: true })
  await scope.dispose()
  return output
}
