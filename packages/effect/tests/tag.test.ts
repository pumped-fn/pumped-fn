import { describe, it, expect } from "vitest"
import { tag, tags, isTag, isTagged } from "../src/tag"
import type { Lite } from "../src/types"

describe("Tag", () => {
  describe("tag()", () => {
    it("creates a tag with label", () => {
      const myTag = tag<string>({ label: "myTag" })

      expect(isTag(myTag)).toBe(true)
      expect(myTag.label).toBe("myTag")
      expect(myTag.hasDefault).toBe(false)
    })

    it("creates a tag with default value", () => {
      const myTag = tag<number>({ label: "count", default: 0 })

      expect(myTag.hasDefault).toBe(true)
      expect(myTag.defaultValue).toBe(0)
    })

    it("creates tagged value when called", () => {
      const myTag = tag<string>({ label: "myTag" })
      const tagged = myTag("hello")

      expect(isTagged(tagged)).toBe(true)
      expect(tagged.value).toBe("hello")
      expect(tagged.key).toBe(myTag.key)
    })
  })

  describe("tag.get()", () => {
    it("returns value from tagged array", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source = [myTag("hello")]

      expect(myTag.get(source)).toBe("hello")
    })

    it("throws when tag not found and no default", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source: Lite.Tagged<unknown>[] = []

      expect(() => myTag.get(source)).toThrow()
    })

    it("returns default when tag not found", () => {
      const myTag = tag<number>({ label: "count", default: 42 })
      const source: Lite.Tagged<unknown>[] = []

      expect(myTag.get(source)).toBe(42)
    })
  })

  describe("tag.find()", () => {
    it("returns value from tagged array", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source = [myTag("hello")]

      expect(myTag.find(source)).toBe("hello")
    })

    it("returns undefined when tag not found", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source: Lite.Tagged<unknown>[] = []

      expect(myTag.find(source)).toBeUndefined()
    })

    it("returns default when tag not found and has default", () => {
      const myTag = tag<number>({ label: "count", default: 42 })
      const source: Lite.Tagged<unknown>[] = []

      expect(myTag.find(source)).toBe(42)
    })
  })

  describe("tag.collect()", () => {
    it("returns all values for tag", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source = [myTag("a"), myTag("b"), myTag("c")]

      expect(myTag.collect(source)).toEqual(["a", "b", "c"])
    })

    it("returns empty array when tag not found", () => {
      const myTag = tag<string>({ label: "myTag" })
      const source: Lite.Tagged<unknown>[] = []

      expect(myTag.collect(source)).toEqual([])
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
