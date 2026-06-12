export type TenantPlan = "free" | "pro"

export interface TenantServices {
  tenantId: string
  plan: TenantPlan
  current(): number
  increment(): number
  close(): Promise<void>
}

const tenants = new Map<string, Promise<TenantServices>>()

export function getOrCreateTenantServices(
  tenantId: string,
  plan: TenantPlan,
  events: string[]
): Promise<TenantServices> {
  const existing = tenants.get(tenantId)

  if (existing) {
    return existing
  }

  let count = 0
  const created = Promise.resolve({
    tenantId,
    plan,
    current: () => count,
    increment: () => {
      count += 1
      return count
    },
    async close() {
      events.push(`closed:${tenantId}:${count}`)
    },
  })

  tenants.set(tenantId, created)

  return created
}

export async function evictTenantServices(tenantId: string): Promise<void> {
  const existing = await tenants.get(tenantId)
  tenants.delete(tenantId)
  await existing?.close()
}

export function tenantCacheSize(): number {
  return tenants.size
}
