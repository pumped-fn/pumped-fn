export type EdgeCaseCategory =
  | "type_no_equivalent"
  | "dynamic_accessor"
  | "spread_dependencies"
  | "resolves_helper"
  | "promised_usage"
  | "static_accessor"
  | "resolve_state"

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

export interface TransformStats {
  filesProcessed: number
  patternsTransformed: number
  patternsWarned: number
  patternsManual: number
}

export interface MigrationReport {
  generatedAt: string
  stats: TransformStats
  edgeCases: EdgeCase[]
}
