import assert from "node:assert/strict"
import test from "node:test"
import { auditAuthoredSource, auditEditorTheme, editorSyntaxPalette } from "./color-audit.mjs"

test("accepts grayscale authored colors", () => {
  assert.equal(auditAuthoredSource("a { color: #333; box-shadow: 0 1px rgb(9 9 9 / 0.2); }", "fixture.css"), 2)
})

test("rejects a chromatic named color", () => {
  assert.throws(() => auditAuthoredSource("a { color: red; }", "fixture.css"), /unsupported authored color syntax/)
})

test("rejects unsupported modern color syntax", () => {
  assert.throws(() => auditAuthoredSource("a { color: oklch(50% 0 0); }", "fixture.css"), /unsupported authored color syntax/)
})

test("rejects unequal RGB channels", () => {
  assert.throws(() => auditAuthoredSource("a { color: rgb(1 2 1); }", "fixture.css"), /non-grayscale authored color/)
})

test("accepts palette and grayscale tokens in the editor theme", () => {
  assert.equal(auditEditorTheme(`keyword: "${editorSyntaxPalette[0]}", plain: "#1f1f1f"`), 2)
})

test("rejects off-palette chromatic tokens in the editor theme", () => {
  assert.throws(() => auditEditorTheme('keyword: "#ff8800"'), /non-grayscale authored color/)
})
