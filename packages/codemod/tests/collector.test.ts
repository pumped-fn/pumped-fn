import { describe, it, expect, beforeEach } from "vitest"
import { EdgeCaseCollector } from "../src/report/collector"
import type { EdgeCase } from "../src/report/types"

describe("EdgeCaseCollector", () => {
  let collector: EdgeCaseCollector

  beforeEach(() => {
    collector = new EdgeCaseCollector()
  })

  it("collects edge cases via add()", () => {
    const edgeCase: EdgeCase = {
      file: "/path/to/file.ts",
      line: 42,
      column: 10,
      pattern: "Core.Static",
      category: "type_no_equivalent",
      context: "type inference",
      surrounding: ["const x: Core.Static<T>"],
      suggestion: "Replace with TypeScript utility types",
    }

    collector.add(edgeCase)
    const report = collector.getReport()

    expect(report.edgeCases).toHaveLength(1)
    expect(report.edgeCases[0]).toEqual(edgeCase)
  })

  it("tracks transform stats via record* methods", () => {
    collector.recordFile()
    collector.recordFile()
    collector.recordTransform()
    collector.recordTransform()
    collector.recordTransform()
    collector.recordWarning()
    collector.recordManual()
    collector.recordManual()

    const report = collector.getReport()

    expect(report.stats.filesProcessed).toBe(2)
    expect(report.stats.patternsTransformed).toBe(3)
    expect(report.stats.patternsWarned).toBe(1)
    expect(report.stats.patternsManual).toBe(2)
  })

  it("getReport() returns correct structure with timestamp", () => {
    const beforeTime = new Date().toISOString()

    collector.recordFile()
    collector.recordTransform()

    const report = collector.getReport()
    const afterTime = new Date().toISOString()

    expect(report).toHaveProperty("generatedAt")
    expect(report).toHaveProperty("stats")
    expect(report).toHaveProperty("edgeCases")
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(report.generatedAt >= beforeTime).toBe(true)
    expect(report.generatedAt <= afterTime).toBe(true)
    expect(report.stats).toEqual({
      filesProcessed: 1,
      patternsTransformed: 1,
      patternsWarned: 0,
      patternsManual: 0,
    })
    expect(Array.isArray(report.edgeCases)).toBe(true)
  })

  it("clear() resets state", () => {
    const edgeCase: EdgeCase = {
      file: "/path/to/file.ts",
      line: 10,
      column: 5,
      pattern: "resolves([a, b])",
      category: "resolves_helper",
      context: "async coordination",
      surrounding: ["const result = resolves([a, b])"],
      suggestion: "Use Promise.all with lite patterns",
    }

    collector.add(edgeCase)
    collector.recordFile()
    collector.recordTransform()
    collector.recordWarning()
    collector.recordManual()

    collector.clear()

    const report = collector.getReport()

    expect(report.edgeCases).toHaveLength(0)
    expect(report.stats.filesProcessed).toBe(0)
    expect(report.stats.patternsTransformed).toBe(0)
    expect(report.stats.patternsWarned).toBe(0)
    expect(report.stats.patternsManual).toBe(0)
  })

  it("handles multiple edge cases from different files", () => {
    const edgeCases: EdgeCase[] = [
      {
        file: "/path/to/a.ts",
        line: 10,
        column: 5,
        pattern: "Core.Static<T>",
        category: "type_no_equivalent",
        context: "type definition",
        surrounding: ["interface Foo { x: Core.Static<T> }"],
        suggestion: "Use TypeScript utility types",
      },
      {
        file: "/path/to/b.ts",
        line: 20,
        column: 15,
        pattern: "condition ? x.lazy : y.lazy",
        category: "dynamic_accessor",
        context: "conditional access",
        surrounding: ["const val = condition ? x.lazy : y.lazy"],
        suggestion: "Extract to helper function",
      },
      {
        file: "/path/to/c.ts",
        line: 30,
        column: 8,
        pattern: "derive([...execs], fn)",
        category: "spread_dependencies",
        context: "dynamic dependencies",
        surrounding: ["const result = derive([...execs], fn)"],
        suggestion: "Use explicit dependency array",
      },
    ]

    edgeCases.forEach((ec) => collector.add(ec))

    const report = collector.getReport()

    expect(report.edgeCases).toHaveLength(3)
    expect(report.edgeCases).toEqual(edgeCases)
  })

  it("allows incrementing stats independently", () => {
    collector.recordFile()
    collector.recordTransform()
    collector.recordTransform()

    const report1 = collector.getReport()
    expect(report1.stats.filesProcessed).toBe(1)
    expect(report1.stats.patternsTransformed).toBe(2)

    collector.recordFile()
    collector.recordWarning()

    const report2 = collector.getReport()
    expect(report2.stats.filesProcessed).toBe(2)
    expect(report2.stats.patternsTransformed).toBe(2)
    expect(report2.stats.patternsWarned).toBe(1)
  })
})
