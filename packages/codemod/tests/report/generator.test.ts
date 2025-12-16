import { describe, it, expect } from "vitest"
import { generateReport } from "../../src/report/generator"
import type { MigrationReport } from "../../src/report/types"

describe("generateReport", () => {
  it("generates correct summary stats", () => {
    const report: MigrationReport = {
      generatedAt: "2024-01-15T10:30:00.000Z",
      stats: {
        filesProcessed: 5,
        patternsTransformed: 12,
        patternsWarned: 3,
        patternsManual: 2,
      },
      edgeCases: [],
    }

    const markdown = generateReport(report)

    expect(markdown).toContain("# Migration Report")
    expect(markdown).toContain("Generated: 2024-01-15T10:30:00.000Z")
    expect(markdown).toContain("✅ Automatically transformed: 12 patterns")
    expect(markdown).toContain("⚠️ Transformed with warnings: 3 patterns")
    expect(markdown).toContain("🔴 Requires manual review: 2 patterns")
    expect(markdown).toContain("📁 Files processed: 5")
  })

  it("includes edge cases with proper formatting", () => {
    const report: MigrationReport = {
      generatedAt: "2024-01-15T10:30:00.000Z",
      stats: {
        filesProcessed: 1,
        patternsTransformed: 0,
        patternsWarned: 0,
        patternsManual: 2,
      },
      edgeCases: [
        {
          file: "src/user.ts",
          line: 42,
          column: 10,
          pattern: "Core.Static<User>",
          category: "type_no_equivalent",
          context: "type definition",
          surrounding: ["type UserAccessor = Core.Static<User>"],
          suggestion: "Use controller(userAtom) and cache result",
        },
        {
          file: "src/app.ts",
          line: 15,
          column: 5,
          pattern: "condition ? x.lazy : y.lazy",
          category: "dynamic_accessor",
          context: "conditional access",
          surrounding: ["const val = condition ? x.lazy : y.lazy"],
          suggestion: "Extract to helper function",
        },
      ],
    }

    const markdown = generateReport(report)

    expect(markdown).toContain("## Manual Review Required")
    expect(markdown).toContain("### 1. src/user.ts:42")
    expect(markdown).toContain("**Pattern**: `Core.Static<User>`")
    expect(markdown).toContain("**Category**: Type has no equivalent in lite")
    expect(markdown).toContain("**Context**:")
    expect(markdown).toContain("```typescript")
    expect(markdown).toContain("type UserAccessor = Core.Static<User>")
    expect(markdown).toContain("**Suggestion**: Use controller(userAtom) and cache result")
    expect(markdown).toContain("### 2. src/app.ts:15")
    expect(markdown).toContain("**Pattern**: `condition ? x.lazy : y.lazy`")
    expect(markdown).toContain("**Category**: Dynamic accessor reference")
  })

  it("JSON is valid and parseable", () => {
    const report: MigrationReport = {
      generatedAt: "2024-01-15T10:30:00.000Z",
      stats: {
        filesProcessed: 1,
        patternsTransformed: 0,
        patternsWarned: 0,
        patternsManual: 1,
      },
      edgeCases: [
        {
          file: "src/test.ts",
          line: 10,
          column: 5,
          pattern: "resolves([a, b])",
          category: "resolves_helper",
          context: "async coordination",
          surrounding: ["const result = resolves([a, b])"],
          suggestion: "Use Promise.all with lite patterns",
        },
      ],
    }

    const markdown = generateReport(report)

    expect(markdown).toContain("## AI Migration Assistance")
    expect(markdown).toContain("Copy the following to Claude/ChatGPT...")

    const jsonMatch = markdown.match(/```json\n([\s\S]*?)\n```/)
    expect(jsonMatch).not.toBeNull()

    const jsonContent = jsonMatch![1]
    const parsed = JSON.parse(jsonContent)

    expect(parsed).toHaveProperty("edgeCases")
    expect(Array.isArray(parsed.edgeCases)).toBe(true)
    expect(parsed.edgeCases).toHaveLength(1)
    expect(parsed.edgeCases[0]).toEqual(report.edgeCases[0])
  })

  it("handles empty edge cases (no Manual Review section)", () => {
    const report: MigrationReport = {
      generatedAt: "2024-01-15T10:30:00.000Z",
      stats: {
        filesProcessed: 3,
        patternsTransformed: 10,
        patternsWarned: 0,
        patternsManual: 0,
      },
      edgeCases: [],
    }

    const markdown = generateReport(report)

    expect(markdown).toContain("# Migration Report")
    expect(markdown).toContain("## Summary")
    expect(markdown).not.toContain("## Manual Review Required")
    expect(markdown).toContain("## AI Migration Assistance")
    expect(markdown).toContain('"edgeCases": []')
  })

  it("handles all category display names", () => {
    const categories = [
      { category: "type_no_equivalent", display: "Type has no equivalent in lite" },
      { category: "static_accessor", display: "Static accessor pattern" },
      { category: "dynamic_accessor", display: "Dynamic accessor reference" },
      { category: "spread_dependencies", display: "Spread in dependencies" },
      { category: "resolves_helper", display: "resolves() helper usage" },
      { category: "promised_usage", display: "Promised class usage" },
      { category: "resolve_state", display: "ResolveState inspection" },
    ]

    categories.forEach(({ category, display }, index) => {
      const report: MigrationReport = {
        generatedAt: "2024-01-15T10:30:00.000Z",
        stats: {
          filesProcessed: 1,
          patternsTransformed: 0,
          patternsWarned: 0,
          patternsManual: 1,
        },
        edgeCases: [
          {
            file: "src/test.ts",
            line: 10,
            column: 5,
            pattern: "test pattern",
            category: category as any,
            context: "test context",
            surrounding: ["test code"],
            suggestion: "test suggestion",
          },
        ],
      }

      const markdown = generateReport(report)
      expect(markdown).toContain(`**Category**: ${display}`)
    })
  })

  it("preserves multiple lines in surrounding context", () => {
    const report: MigrationReport = {
      generatedAt: "2024-01-15T10:30:00.000Z",
      stats: {
        filesProcessed: 1,
        patternsTransformed: 0,
        patternsWarned: 0,
        patternsManual: 1,
      },
      edgeCases: [
        {
          file: "src/complex.ts",
          line: 20,
          column: 8,
          pattern: "Core.Static<User>",
          category: "type_no_equivalent",
          context: "complex type",
          surrounding: [
            "interface UserData {",
            "  id: string",
            "  accessor: Core.Static<User>",
            "}",
          ],
          suggestion: "Refactor to use controller pattern",
        },
      ],
    }

    const markdown = generateReport(report)

    expect(markdown).toContain("interface UserData {")
    expect(markdown).toContain("  id: string")
    expect(markdown).toContain("  accessor: Core.Static<User>")
    expect(markdown).toContain("}")
  })
})
