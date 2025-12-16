import type { EdgeCase, MigrationReport, TransformStats } from "./types"

export class EdgeCaseCollector {
  private edgeCases: EdgeCase[] = []
  private stats: TransformStats = {
    filesProcessed: 0,
    patternsTransformed: 0,
    patternsWarned: 0,
    patternsManual: 0,
  }

  add(edgeCase: EdgeCase): void {
    this.edgeCases.push(edgeCase)
  }

  recordFile(): void {
    this.stats.filesProcessed++
  }

  recordTransform(): void {
    this.stats.patternsTransformed++
  }

  recordWarning(): void {
    this.stats.patternsWarned++
  }

  recordManual(): void {
    this.stats.patternsManual++
  }

  getReport(): MigrationReport {
    return {
      generatedAt: new Date().toISOString(),
      stats: { ...this.stats },
      edgeCases: [...this.edgeCases],
    }
  }

  clear(): void {
    this.edgeCases = []
    this.stats = {
      filesProcessed: 0,
      patternsTransformed: 0,
      patternsWarned: 0,
      patternsManual: 0,
    }
  }
}
