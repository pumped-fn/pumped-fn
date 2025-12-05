import { describe, it, expect } from "vitest"
import { tag, tags, isTag, isTagged } from "../src/tag"
import { ParseError } from "../src/errors"
import type { Lite } from "../src/types"

describe("Tag", () => {
  describe("tag()", () => {
    it("preserves all config properties", () => {
      const simpleTag = tag<string>({ label: "simple" })
      const tagWithDefault = tag<number>({ label: "count", default: 0 })
      const tagWithParse = tag({
        label: "parsed",
        parse: (raw: unknown) => Number(raw),
      })

      expect(isTag(simpleTag)).toBe(true)
      expect(simpleTag.label).toBe("simple")
      expect(simpleTag.hasDefault).toBe(false)

      expect(tagWithDefault.hasDefault).toBe(true)
      expect(tagWithDefault.defaultValue).toBe(0)

      expect(tagWithParse.parse).toBeDefined()
    })

    it("creates tagged values when called", () => {
      const myTag = tag<string>({ label: "myTag" })
      const tagged = myTag("hello")

      expect(isTagged(tagged)).toBe(true)
      expect(tagged.value).toBe("hello")
      expect(tagged.key).toBe(myTag.key)
    })

    it("parse validates values and throws ParseError on failure", () => {
      const numberTag = tag({
        label: "count",
        parse: (raw: unknown) => {
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be a number")
          return n
        },
      })

      const valid = numberTag(42)
      expect(valid.value).toBe(42)

      try {
        numberTag("not-a-number" as unknown as number)
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as ParseError
        expect(parseErr.phase).toBe("tag")
        expect(parseErr.label).toBe("count")
        expect(parseErr.cause).toBeInstanceOf(Error)
      }
    })

    it("default value bypasses parse validation", () => {
      let parseCalled = false
      const numberTag = tag({
        label: "count",
        parse: () => { parseCalled = true; return 0 },
        default: 0,
      })

      expect(numberTag.defaultValue).toBe(0)
      expect(parseCalled).toBe(false)
    })
  })

  describe("tag retrieval methods", () => {
    it("get/find/collect retrieve values from tagged arrays", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source = [myTag("a"), myTag("b"), myTag("c")]

      expect(myTag.get(source)).toBe("a")
      expect(myTag.find(source)).toBe("a")
      expect(myTag.collect(source)).toEqual(["a", "b", "c"])
    })

    it("handles missing tags appropriately per method", () => {
      const noDefault = tag<string>({ label: "noDefault" })
      const withDefault = tag<number>({ label: "withDefault", default: 42 })
      const empty: Lite.Tagged<unknown>[] = []

      expect(() => noDefault.get(empty)).toThrow()
      expect(noDefault.find(empty)).toBeUndefined()
      expect(noDefault.collect(empty)).toEqual([])

      expect(withDefault.get(empty)).toBe(42)
      expect(withDefault.find(empty)).toBe(42)
    })
  })

  describe("tags helpers", () => {
    it("creates tag executors with correct modes", () => {
      const myTag = tag<string>({ label: "myTag" })

      const required = tags.required(myTag)
      expect(required.mode).toBe("required")
      expect(required.tag).toBe(myTag)

      const optional = tags.optional(myTag)
      expect(optional.mode).toBe("optional")

      const all = tags.all(myTag)
      expect(all.mode).toBe("all")
    })
  })
})
