import type { Flow } from "@pumped-fn/core-next"
import { flow, tag, custom } from "@pumped-fn/core-next"

const auditTag = tag(custom<string>(), { label: "audit" })
const tenantTag = tag(custom<string>(), { label: "tenant" })

const maybeTenant = process.env.EXAMPLE_TENANT

const tags = [
  auditTag("flow-spread"),
  ...(maybeTenant ? [tenantTag(maybeTenant)] : []),
]

const getUserFlow: Flow.Flow<string, { userId: string; audit: string; tenant?: string }> =
  flow(
    {
      input: custom<string>(),
      output: custom<{ userId: string; audit: string; tenant?: string }>(),
      tags,
    },
    (ctx, userId) => ({
      userId,
      audit: ctx.get(auditTag),
      tenant: ctx.find(tenantTag),
    }),
  )

const result = await flow.execute(getUserFlow, "42", {
  executionTags: maybeTenant ? [] : [tenantTag("runtime-tenant")],
})

console.log(result)
