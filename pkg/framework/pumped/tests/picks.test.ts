import { attribute, createScope, flag, flow, tag, tags } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { analyze } from "../src/analyze"
import { planTarget } from "../src/build-config"
import { entry } from "../src/entry"
import { httpHost } from "../src/hosts/http"
import type { Manifest, ManifestEntry } from "../src/runtime/manifest"
import { command, route } from "../src/tags"
import { manifest, manifestEntry } from "./helpers"

const capability = attribute<string>({ label: "example.capability" })
const server = attribute<string>({ label: "example.server", select: false })
const internal = flag({ label: "example.internal" })

const basic = flow({ name: "basic", factory: () => ({ tier: "basic" }) })
const premium = flow({ name: "premium", factory: () => ({ tier: "premium" }) })

function classified(name: string, tags: Parameters<typeof entry>[0]["tags"], attributes?: Parameters<typeof entry>[0]["attributes"]): ManifestEntry {
  return manifestEntry(name, basic, tags, { file: `src/entries/${name}.ts`, ...(attributes === undefined ? {} : { attributes }) })
}

describe("the app picks entries", () => {
  it("mounts a classified entry only when the app includes its facts", async () => {
    const billing = classified("refund", [route({ method: "POST", path: "/refunds" })], [capability("billing")])

    const pro = createScope({})
    const enabledRuntime = httpHost.start({
      scope: pro,
      manifest: manifest({ attributes: { include: [capability("billing")] } }, billing),
    })
    expect((await enabledRuntime.fetch(new Request("http://test/refunds", { method: "POST" }))).status).toBe(200)
    await pro.dispose()

    const plain = createScope({})
    const disabledRuntime = httpHost.start({ scope: plain, manifest: manifest(undefined, billing) })
    expect((await disabledRuntime.fetch(new Request("http://test/refunds", { method: "POST" }))).status).toBe(404)
    await plain.dispose()
  })

  it("lets exclude win over include", async () => {
    const billing = classified("refund", [route({ method: "POST", path: "/refunds" })], [capability("billing")])
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        { attributes: { include: [capability("billing")], exclude: [capability("billing")] } },
        billing
      ),
    })

    expect((await runtime.fetch(new Request("http://test/refunds", { method: "POST" }))).status).toBe(404)
    await scope.dispose()
  })

  it("includes a whole family with a bare attribute, trimmed by value excludes", async () => {
    const entries = [
      classified("billing", [route({ method: "GET", path: "/billing" })], [capability("billing")]),
      classified("experimental", [route({ method: "GET", path: "/experimental" })], [capability("experimental")]),
    ]
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        { attributes: { include: [capability], exclude: [capability("experimental")] } },
        ...entries
      ),
    })

    expect((await runtime.fetch(new Request("http://test/billing"))).status).toBe(200)
    expect((await runtime.fetch(new Request("http://test/experimental"))).status).toBe(404)
    await scope.dispose()
  })

  it("excludes a whole family with a bare attribute, beating value includes", async () => {
    const billing = classified("billing", [route({ method: "GET", path: "/billing" })], [capability("billing")])
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        { attributes: { include: [capability("billing")], exclude: [capability] } },
        billing
      ),
    })

    expect((await runtime.fetch(new Request("http://test/billing"))).status).toBe(404)
    await scope.dispose()
  })

  it("picks per mount when facts attach to one mount tag", async () => {
    const mixed = classified("mixed", [
      route({ method: "GET", path: "/always" }),
      route({ method: "GET", path: "/beta-only" }, { attributes: [capability("beta")] }),
    ])

    const plain = createScope({})
    const runtime = httpHost.start({ scope: plain, manifest: manifest(undefined, mixed) })
    expect((await runtime.fetch(new Request("http://test/always"))).status).toBe(200)
    expect((await runtime.fetch(new Request("http://test/beta-only"))).status).toBe(404)
    await plain.dispose()

    const beta = createScope({})
    const betaRuntime = httpHost.start({
      scope: beta,
      manifest: manifest({ attributes: { include: [capability("beta")] } }, mixed),
    })
    expect((await betaRuntime.fetch(new Request("http://test/beta-only"))).status).toBe(200)
    await beta.dispose()
  })

  it("ignores consumer-owned attributes and flags when picking", async () => {
    const addressed = classified(
      "health",
      [route({ method: "GET", path: "/health" }, { attributes: [server("admin"), internal()] })]
    )

    const scope = createScope({})
    const runtime = httpHost.start({ scope, manifest: manifest(undefined, addressed) })
    expect((await runtime.fetch(new Request("http://test/health"))).status).toBe(200)
    await scope.dispose()
  })

  it("never seeds an unpicked tag into an activation context", async () => {
    const tenant = tag<{ name: string }>({ label: "example.pick.tenant" })
    const whoami = flow({
      deps: { tenant: tags.optional(tenant) },
      factory: (_ctx, deps) => ({ tenant: deps.tenant?.name ?? null }),
    })
    const mixed = manifestEntry("whoami", whoami, [
      route({ method: "GET", path: "/whoami" }),
      tenant({ name: "acme" }, { attributes: [capability("beta")] }),
    ])

    const plain = createScope({})
    const plainRuntime = httpHost.start({ scope: plain, manifest: manifest(undefined, mixed) })
    expect(await (await plainRuntime.fetch(new Request("http://test/whoami"))).json()).toEqual({ tenant: null })
    await plain.dispose()

    const beta = createScope({})
    const betaRuntime = httpHost.start({
      scope: beta,
      manifest: manifest({ attributes: { include: [capability("beta")] } }, mixed),
    })
    expect(await (await betaRuntime.fetch(new Request("http://test/whoami"))).json()).toEqual({ tenant: "acme" })
    await beta.dispose()
  })

  it("applies family rules in the build plan census", () => {
    const planned: Manifest = {
      app: { attributes: { include: [capability], exclude: [capability("experimental")] } },
      entries: [
        classified("billing", [route({ method: "GET", path: "/billing" })], [capability("billing")]),
        classified("experimental", [route({ method: "GET", path: "/experimental" })], [capability("experimental")]),
      ],
    }

    expect(planTarget(planned, "server")).toEqual({ files: ["src/entries/billing.ts"], hosts: ["http"] })
  })

  it("drops unpicked entries and mounts from the build plan", () => {
    const planned: Manifest = {
      app: { attributes: { include: [capability("billing")] } },
      entries: [
        classified("refund", [route({ method: "POST", path: "/refunds" })], [capability("billing")]),
        classified("preview", [route({ method: "GET", path: "/preview" })], [capability("preview")]),
        classified("report", [command({ name: "report" })]),
        classified("gated-mount", [command({ name: "gated" }, { attributes: [capability("preview")] })]),
      ],
    }

    expect(planTarget(planned, "server")).toEqual({ files: ["src/entries/refund.ts"], hosts: ["http"] })
    expect(planTarget(planned, "cli")).toEqual({ files: ["src/entries/report.ts"], hosts: ["cli"] })
  })

  it("keeps variant entries apart: a classified variant never leaks into an app that does not include it", () => {
    const variants = (app: Manifest["app"]): Manifest =>
      manifest(
        app,
        manifestEntry("search-basic", basic, [route({ method: "GET", path: "/search" })]),
        manifestEntry("search-premium", premium, [route({ method: "GET", path: "/search" })], { attributes: [capability("premium")] })
      )

    expect(analyze(variants(undefined)).excluded).toEqual(["search-premium"])
    expect(analyze(variants(undefined)).failures).toEqual([])
    const premiumApp = analyze(
      variants({ attributes: { include: [capability("premium")], exclude: [] } })
    )
    expect(premiumApp.excluded).toEqual([])
    expect(premiumApp.failures).toContainEqual(expect.objectContaining({ code: "duplicate-route" }))
  })

  it("does not fail no-host when all mounts of an entry are merely picked off", () => {
    const report = analyze(
      manifest(undefined, classified("gated", [command({ name: "gated" }, { attributes: [capability("preview")] })]))
    )

    expect(report.failures).toEqual([])
    expect(report.excluded).toEqual([])
  })

  it("skips every static check for unpicked entries and reports them", () => {
    const report = analyze(
      manifest(undefined, classified("gone", [route({ method: "GET", path: "/gone" })], [capability("off")]))
    )

    expect(report.excluded).toEqual(["gone"])
    expect(report.failures).toEqual([])
    expect(report.nodes.filter((node) => node.kind === "root")).toEqual([])
  })

  it("accepts an app carrying picking rules at createScope with nothing becoming ambient", async () => {
    const scope = createScope({ attributes: { include: [capability("billing")] } } as Manifest["app"] & object)
    const observed = flow({ factory: () => "ran" })

    await expect(scope.run({ flow: observed })).resolves.toBe("ran")
    await scope.dispose()
  })
})
