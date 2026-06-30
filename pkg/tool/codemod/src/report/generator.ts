import type { MigrationReport, EdgeCaseCategory, EdgeCase } from "./types"

const CATEGORY_DISPLAY: Record<EdgeCaseCategory, string> = {
  type_no_equivalent: "Type has no equivalent in lite",
  static_accessor: "Static accessor pattern",
  dynamic_accessor: "Dynamic accessor reference",
  spread_dependencies: "Spread in dependencies",
  resolves_helper: "resolves() helper usage",
  promised_usage: "Promised class usage",
  resolve_state: "ResolveState inspection",
}

export function generateReport(report: MigrationReport): string {
  const sections: string[] = []

  sections.push("# Migration Report")
  sections.push(`Generated: ${report.generatedAt}`)
  sections.push("")

  sections.push("## Summary")
  sections.push(`- ✅ Automatically transformed: ${report.stats.patternsTransformed} patterns`)
  sections.push(`- ⚠️ Transformed with warnings: ${report.stats.patternsWarned} patterns`)
  sections.push(`- 🔴 Requires manual review: ${report.stats.patternsManual} patterns`)
  sections.push(`- 📁 Files processed: ${report.stats.filesProcessed}`)
  sections.push("")

  if (report.edgeCases.length > 0) {
    sections.push("## Manual Review Required")
    report.edgeCases.forEach((edgeCase, index) => {
      sections.push(`### ${index + 1}. ${edgeCase.file}:${edgeCase.line}`)
      sections.push(`**Pattern**: \`${edgeCase.pattern}\``)
      sections.push(`**Category**: ${CATEGORY_DISPLAY[edgeCase.category]}`)
      sections.push(`**Context**:`)
      sections.push("```typescript")
      edgeCase.surrounding.forEach((line) => sections.push(line))
      sections.push("```")
      sections.push(`**Suggestion**: ${edgeCase.suggestion}`)
      sections.push("")
    })
  }

  sections.push("## AI Migration Assistance")
  sections.push("Copy the following to Claude/ChatGPT...")
  sections.push("```json")
  sections.push(JSON.stringify({ edgeCases: report.edgeCases }, null, 2))
  sections.push("```")

  return sections.join("\n")
}
