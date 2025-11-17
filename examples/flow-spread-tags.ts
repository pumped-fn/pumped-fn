import { flow, tag, custom } from "@pumped-fn/core-next";

const auditTag = tag(custom<string>(), { label: "audit" });
const tenantTag = tag(custom<string>(), { label: "tenant" });

const maybeTenant = process.env.EXAMPLE_TENANT;

const getUserFlow = flow(
  (ctx, userId: string) => {
    const tenant = ctx.find(tenantTag);
    return {
      userId,
      audit: ctx.get(auditTag),
      tenant,
    };
  },
  auditTag("flow-spread"),
  ...(maybeTenant ? [tenantTag(maybeTenant)] : [])
);

const result = await flow.execute(getUserFlow, "42", {
  executionTags: maybeTenant ? [] : [tenantTag("runtime-tenant")],
});

console.log(result);
