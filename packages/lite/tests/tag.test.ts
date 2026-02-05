import { describe, it, expect } from "vitest"
import { tag, tags, isTag, isTagged, getAllTags } from "../src/tag"
import { atom } from "../src/atom"
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

  describe("tag.atoms() registry", () => {
    it("returns empty array when no atoms use the tag", () => {
      const unusedTag = tag<string>({ label: "unused" })
      expect(unusedTag.atoms()).toEqual([])
    })

    it("tracks atoms that use the tag", () => {
      const trackedTag = tag<boolean>({ label: "tracked" })

      const atomA = atom({
        tags: [trackedTag(true)],
        factory: () => "a",
      })

      const atomB = atom({
        tags: [trackedTag(true)],
        factory: () => "b",
      })

      const tracked = trackedTag.atoms()
      expect(tracked).toHaveLength(2)
      expect(tracked).toContain(atomA)
      expect(tracked).toContain(atomB)
    })

    it("tracks atom with multiple tags", () => {
      const tagOne = tag<string>({ label: "tagOne" })
      const tagTwo = tag<number>({ label: "tagTwo" })

      const multiTagAtom = atom({
        tags: [tagOne("value"), tagTwo(42)],
        factory: () => "multi",
      })

      expect(tagOne.atoms()).toContain(multiTagAtom)
      expect(tagTwo.atoms()).toContain(multiTagAtom)
    })

    it("tagged value includes reference to parent tag", () => {
      const refTag = tag<string>({ label: "refTag" })
      const tagged = refTag("hello")

      expect(tagged.tag).toBe(refTag)
    })

    it("does not track atoms without tags", () => {
      const someTag = tag<string>({ label: "someTag" })

      atom({
        factory: () => "no-tags",
      })

      const initialCount = someTag.atoms().length

      atom({
        tags: [someTag("with-tag")],
        factory: () => "with-tags",
      })

      expect(someTag.atoms()).toHaveLength(initialCount + 1)
    })
  })

  describe("getAllTags() registry", () => {
    it("returns all created tags", () => {
      const initialCount = getAllTags().length

      const newTag1 = tag<string>({ label: "getAllTags-test-1" })
      const newTag2 = tag<number>({ label: "getAllTags-test-2" })

      const allTags = getAllTags()
      expect(allTags.length).toBeGreaterThanOrEqual(initialCount + 2)
      expect(allTags).toContain(newTag1)
      expect(allTags).toContain(newTag2)
    })

    it("includes tags with different configurations", () => {
      const simpleTag = tag<string>({ label: "getAllTags-simple" })
      const defaultTag = tag({ label: "getAllTags-default", default: 42 })
      const parseTag = tag({
        label: "getAllTags-parse",
        parse: (raw: unknown) => String(raw),
      })

      const allTags = getAllTags()
      expect(allTags).toContain(simpleTag)
      expect(allTags).toContain(defaultTag)
      expect(allTags).toContain(parseTag)
    })
  })
})
