export type EdgeCaseCategory =
  | "type_no_equivalent"
  | "dynamic_accessor"
  | "spread_dependencies"
  | "resolves_helper"
  | "promised_usage"
  | "static_accessor"
  | "resolve_state"

/** Records a source pattern that requires warning or manual migration. */
export interface EdgeCase {
  file: string
  line: number
  column: number
  pattern: string
  category: EdgeCaseCategory
  context: string
  surrounding: string[]
  suggestion: string
}

/** Summarizes files and patterns handled by a codemod run. */
export interface TransformStats {
  filesProcessed: number
  patternsTransformed: number
  patternsWarned: number
  patternsManual: number
}

/** Collects codemod statistics and unresolved edge cases for one migration. */
export interface MigrationReport {
  generatedAt: string
  stats: TransformStats
  edgeCases: EdgeCase[]
}
