import { tag } from "@pumped-fn/lite"
import { z } from "zod"

const githubShape = z.object({
  token: z.string().min(1),
  repository: z.string().regex(/^[^/]+\/[^/]+$/),
  label: z.string().min(1),
  apiUrl: z.string().url(),
  pollIntervalMs: z.number().int().min(1_000),
  leaseMs: z.number().int().min(10_000),
  publicationTimeoutMs: z.number().int().min(1_000),
  maxAttempts: z.number().int().min(1).max(20),
}).strict().refine((value) => value.publicationTimeoutMs < value.leaseMs, {
  message: "Publication timeout must be shorter than the lease",
  path: ["publicationTimeoutMs"],
})
const planShape = z.object({
  repositoryRoot: z.string().startsWith("/"),
  codePath: z.string().min(1),
  codeQuery: z.string().min(1),
  databaseQuery: z.string().min(1),
  victoriaQuery: z.string().min(1),
  victoriaMaxWindowMs: z.number().int().min(60_000).max(86_400_000),
  evidenceMaxAgeMs: z.number().int().min(60_000),
  statementTimeoutMs: z.number().int().min(100).max(60_000),
  maxEvidenceBytes: z.number().int().min(1_024).max(1_048_576),
}).strict()
const victoriaShape = z.object({
  url: z.string().url(),
  tenant: z.string().min(1).optional(),
}).strict()
const modelShape = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  thinking: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  apiKeyEnv: z.string().min(1).optional(),
}).strict()

export type GitHubConfig = z.infer<typeof githubShape>
export type AnalysisPlan = z.infer<typeof planShape>
export type VictoriaConfig = z.infer<typeof victoriaShape>
export type ModelConfig = z.infer<typeof modelShape>

const environmentShape = z.object({
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_REPOSITORY: z.string().regex(/^[^/]+\/[^/]+$/),
  GITHUB_LABEL: z.string().min(1).default("agent:triage"),
  GITHUB_API_URL: z.string().url().default("https://api.github.com"),
  GITHUB_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(30_000),
  GITHUB_LEASE_MS: z.coerce.number().int().min(10_000).default(300_000),
  GITHUB_PUBLICATION_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  GITHUB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  CONTROL_DATABASE_URL: z.string().url(),
  TARGET_DATABASE_URL: z.string().url(),
  REPOSITORY_ROOT: z.string().startsWith("/"),
  CODE_PATH: z.string().min(1),
  CODE_QUERY: z.string().min(1),
  DATABASE_QUERY: z.string().min(1),
  VICTORIA_URL: z.string().url(),
  VICTORIA_TENANT: z.string().min(1).optional(),
  VICTORIA_QUERY: z.string().min(1),
  VICTORIA_MAX_WINDOW_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(3_600_000),
  EVIDENCE_MAX_AGE_MS: z.coerce.number().int().min(60_000).default(3_600_000),
  STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  MAX_EVIDENCE_BYTES: z.coerce.number().int().min(1_024).max(1_048_576).default(65_536),
  MODEL_PROVIDER: z.string().min(1),
  MODEL_ID: z.string().min(1),
  MODEL_THINKING: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  MODEL_API_KEY_ENV: z.string().min(1).optional(),
})

export const config = {
  clock: tag<() => number>({ label: "issue-triage.config.clock" }),
  github: tag<GitHubConfig>({ label: "issue-triage.config.github" }),
  plan: tag<AnalysisPlan>({ label: "issue-triage.config.plan" }),
  victoria: tag<VictoriaConfig>({ label: "issue-triage.config.victoria" }),
  model: tag<ModelConfig>({ label: "issue-triage.config.model" }),
  controlDatabaseUrl: tag<string>({ label: "issue-triage.config.control-database-url" }),
  targetDatabaseUrl: tag<string>({ label: "issue-triage.config.target-database-url" }),
}

export function loadEnvironment(environment: NodeJS.ProcessEnv) {
  const value = environmentShape.parse(environment)
  return {
    github: githubShape.parse({
      token: value.GITHUB_TOKEN,
      repository: value.GITHUB_REPOSITORY,
      label: value.GITHUB_LABEL,
      apiUrl: value.GITHUB_API_URL,
      pollIntervalMs: value.GITHUB_POLL_INTERVAL_MS,
      leaseMs: value.GITHUB_LEASE_MS,
      publicationTimeoutMs: value.GITHUB_PUBLICATION_TIMEOUT_MS,
      maxAttempts: value.GITHUB_MAX_ATTEMPTS,
    }),
    plan: planShape.parse({
      repositoryRoot: value.REPOSITORY_ROOT,
      codePath: value.CODE_PATH,
      codeQuery: value.CODE_QUERY,
      databaseQuery: value.DATABASE_QUERY,
      victoriaQuery: value.VICTORIA_QUERY,
      victoriaMaxWindowMs: value.VICTORIA_MAX_WINDOW_MS,
      evidenceMaxAgeMs: value.EVIDENCE_MAX_AGE_MS,
      statementTimeoutMs: value.STATEMENT_TIMEOUT_MS,
      maxEvidenceBytes: value.MAX_EVIDENCE_BYTES,
    }),
    victoria: victoriaShape.parse({
      url: value.VICTORIA_URL,
      ...(value.VICTORIA_TENANT === undefined ? {} : { tenant: value.VICTORIA_TENANT }),
    }),
    model: modelShape.parse({
      provider: value.MODEL_PROVIDER,
      modelId: value.MODEL_ID,
      ...(value.MODEL_THINKING === undefined ? {} : { thinking: value.MODEL_THINKING }),
      ...(value.MODEL_API_KEY_ENV === undefined ? {} : { apiKeyEnv: value.MODEL_API_KEY_ENV }),
    }),
    controlDatabaseUrl: value.CONTROL_DATABASE_URL,
    targetDatabaseUrl: value.TARGET_DATABASE_URL,
  }
}
