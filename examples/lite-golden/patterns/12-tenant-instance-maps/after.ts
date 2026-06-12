import { atom, createScope, flow, preset, tag, tags, typed, type Lite } from "@pumped-fn/lite"

export type PlanTier = "free" | "pro"

export interface TenantScopeConfig {
  tenantId: string
  plan: PlanTier
  cleanupLog?: string[]
}

export interface TenantIdentity {
  tenantId: string
}

export interface TenantStrategy {
  name: PlanTier
  limit: number
  format(tenantId: string, count: number): string
}

export interface TenantCounter {
  tenantId: string
  current(): number
  increment(): number
}

export interface UsageInput {
  units: number
}

export interface UsageReceipt {
  tenantId: string
  plan: PlanTier
  count: number
  limit: number
  units: number
  receipt: string
}

export interface TenantSnapshot {
  tenantId: string
  plan: PlanTier
  count: number
  limit: number
}

export const tenant = tag<string>({ label: "tenant.id" })

export const cleanupSink = atom<string[]>({
  factory: () => [],
})

export const tenantIdentity = atom({
  deps: { tenantId: tags.required(tenant) },
  factory: (_ctx, { tenantId }): TenantIdentity => ({ tenantId }),
})

export const freeStrategy: TenantStrategy = {
  name: "free",
  limit: 1,
  format: (tenantId, count) => `${tenantId}:free:${count}`,
}

export const proStrategy: TenantStrategy = {
  name: "pro",
  limit: 100,
  format: (tenantId, count) => `${tenantId}:pro:${count}`,
}

export const strategy = atom<TenantStrategy>({
  factory: () => freeStrategy,
})

export const tenantCounter = atom({
  deps: {
    tenantId: tags.required(tenant),
    cleanupLog: cleanupSink,
  },
  factory: (ctx, { tenantId, cleanupLog }): TenantCounter => {
    let count = 0

    ctx.cleanup(() => {
      cleanupLog.push(`closed:${tenantId}:${count}`)
    })

    return {
      tenantId,
      current: () => count,
      increment: () => {
        count += 1
        return count
      },
    }
  },
})

export const recordUsage = flow({
  parse: typed<UsageInput>(),
  deps: {
    identity: tenantIdentity,
    strategy,
    counter: tenantCounter,
  },
  factory: (ctx, { identity, strategy, counter }): UsageReceipt => {
    const count = counter.increment()

    return {
      tenantId: identity.tenantId,
      plan: strategy.name,
      count,
      limit: strategy.limit,
      units: ctx.input.units,
      receipt: strategy.format(identity.tenantId, count),
    }
  },
})

export const tenantSnapshot = flow({
  deps: {
    identity: tenantIdentity,
    strategy,
    counter: tenantCounter,
  },
  factory: (_ctx, { identity, strategy, counter }): TenantSnapshot => ({
    tenantId: identity.tenantId,
    plan: strategy.name,
    count: counter.current(),
    limit: strategy.limit,
  }),
})

export function tierPresets(plan: PlanTier): Lite.Preset<TenantStrategy>[] {
  return [preset(strategy, plan === "pro" ? proStrategy : freeStrategy)]
}

export function createTenantScope(config: TenantScopeConfig): Lite.Scope {
  return createScope({
    tags: [tenant(config.tenantId)],
    presets: config.cleanupLog
      ? [...tierPresets(config.plan), preset(cleanupSink, config.cleanupLog)]
      : tierPresets(config.plan),
  })
}
