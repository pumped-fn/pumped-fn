import { describe, expect, it } from "vitest"
import { attribute, flag, isAttribute, isAttributed, isTagged, tag } from "../src/index"

describe("attribute", () => {
  it("reads bindings as membership through has and collect", () => {
    const capability = attribute<string>({ label: "example.capability" })
    const carrier = [capability("billing"), capability("beta")]

    expect(isAttribute(capability)).toBe(true)
    expect(isAttributed(capability("billing"))).toBe(true)
    expect(capability.select).toBe(true)
    expect(capability.has(carrier, "billing")).toBe(true)
    expect(capability.has(carrier, "beta")).toBe(true)
    expect(capability.has(carrier, "premium")).toBe(false)
    expect(capability.collect(carrier)).toEqual(["billing", "beta"])
    expect(capability.has([], "billing")).toBe(false)
    expect(capability.collect([])).toEqual([])
  })

  it("keeps consumer-owned attributes out of picking via select: false", () => {
    const server = attribute<string>({ label: "example.server", select: false })

    expect(server.select).toBe(false)
    expect(server.has([server("admin")], "admin")).toBe(true)
  })

  it("keeps distinct attributes apart even with equal labels", () => {
    const first = attribute<string>({ label: "example.same-label" })
    const second = attribute<string>({ label: "example.same-label" })

    expect(first.has([second("value")], "value")).toBe(false)
  })

  it("honors a custom eq in membership checks", () => {
    const versions = attribute<{ major: number }>({ label: "example.version", eq: (a, b) => a.major === b.major })

    expect(versions.has([versions({ major: 2 })], { major: 2 })).toBe(true)
    expect(versions.has([versions({ major: 2 })], { major: 3 })).toBe(false)
  })

  it("splits the attributes creation option out of the tagged value", () => {
    const route = tag<{ path: string }>({ label: "example.route" })
    const server = attribute<string>({ label: "example.route.server", select: false })

    const plain = route({ path: "/greet" })
    const addressed = route({ path: "/health" }, { attributes: [server("admin")] })

    expect(isTagged(addressed)).toBe(true)
    expect(plain.attributes).toBeUndefined()
    expect(addressed.value).toEqual({ path: "/health" })
    expect(server.has(addressed, "admin")).toBe(true)
    expect(server.has(plain, "admin")).toBe(false)
    expect(route.find([addressed])).toEqual({ path: "/health" })
    expect(route.collect([addressed])).toEqual([{ path: "/health" }])
  })

  it("materializes declaration attributes into every tagged, overridden per attribute by the call", () => {
    const server = attribute<string>({ label: "example.decl.server", select: false })
    const zone = attribute<string>({ label: "example.decl.zone", select: false })
    const route = tag<{ path: string }>({
      label: "example.decl.route",
      attributes: [server("default"), zone("public")],
    })

    const plain = route({ path: "/greet" })
    expect(server.has(plain, "default")).toBe(true)
    expect(zone.has(plain, "public")).toBe(true)

    const addressed = route({ path: "/health" }, { attributes: [server("admin")] })
    expect(server.collect(addressed)).toEqual(["admin"])
    expect(zone.has(addressed, "public")).toBe(true)
    expect(addressed.value).toEqual({ path: "/health" })
  })

  it("marks presence with flags, which never participate in picking", () => {
    const internal = flag({ label: "example.internal" })
    const route = tag<{ path: string }>({ label: "example.route.flagged" })

    expect(isAttribute(internal)).toBe(true)
    expect(internal.select).toBe(false)
    expect(internal.has(route({ path: "/debug" }, { attributes: [internal()] }))).toBe(true)
    expect(internal.has(route({ path: "/greet" }))).toBe(false)
  })

  it("never touches the value: attributes-shaped data fields and class instances round-trip", () => {
    const node = tag<{ id: number; attributes: string[] }>({ label: "example.data-field" })
    const bound = node({ id: 1, attributes: ["a"] })
    expect(bound.value).toEqual({ id: 1, attributes: ["a"] })
    expect(bound.attributes).toBeUndefined()

    class Payload {
      attributes = ["data"]
      constructor(readonly name: string) {}
    }
    const instances = tag<Payload>({ label: "example.instance" })
    const instance = instances(new Payload("n"))
    expect(instance.value).toBeInstanceOf(Payload)
    expect(instance.value.attributes).toEqual(["data"])
    expect(instance.attributes).toBeUndefined()
  })

  it("binds attributes to non-object tag values through the options argument", () => {
    const region = tag<string>({ label: "example.region" })
    const zone = attribute<string>({ label: "example.region.zone", select: false })

    const bound = region("east", { attributes: [zone("public")] })
    expect(bound.value).toBe("east")
    expect(zone.has(bound, "public")).toBe(true)
  })

  it("rejects non-attributed leaves with a clear error", () => {
    const server = attribute<string>({ label: "example.leaf" })

    expect(() => server.has(["nope"] as never, "x")).toThrow(
      "attributes must contain only attributed values and arrays"
    )
  })

  it("rejects cyclic attribute arrays", () => {
    const server = attribute<string>({ label: "example.cyclic" })
    const cyclic: unknown[] = []
    cyclic.push(cyclic)

    expect(() => server.has(cyclic as never, "x")).toThrow("attributes must not contain cyclic arrays")
  })
})
