export const version = "0.1.0";

export { transform, getCollector } from "./transforms/core-next-to-lite"
export { EdgeCaseCollector } from "./report/collector"
export { generateReport } from "./report/generator"
export type { EdgeCase, MigrationReport, TransformStats } from "./report/types"
