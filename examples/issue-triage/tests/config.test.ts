import { describe, expect, it } from "vitest"
import { loadEnvironment } from "../src/config.js"

describe("issue triage configuration", () => {
  it("accepts unrelated process environment entries", () => {
    expect(loadEnvironment({
      PATH: "/usr/bin",
      HOME: "/home/triage",
      GITHUB_TOKEN: "token",
      GITHUB_REPOSITORY: "acme/payments",
      GITHUB_LABEL: "agent:triage",
      GITHUB_API_URL: "https://api.github.test",
      GITHUB_POLL_INTERVAL_MS: "30000",
      GITHUB_LEASE_MS: "300000",
      GITHUB_PUBLICATION_TIMEOUT_MS: "30000",
      GITHUB_MAX_ATTEMPTS: "5",
      CONTROL_DATABASE_URL: "postgresql://triage:secret@control.test/triage",
      TARGET_DATABASE_URL: "postgresql://analyst:secret@target.test/payments",
      REPOSITORY_ROOT: "/workspace/acme/payments",
      CODE_PATH: "src/checkout.ts",
      CODE_QUERY: "checkout",
      DATABASE_QUERY: "SELECT * FROM pg_stat_statements",
      VICTORIA_URL: "https://victoria.test",
      VICTORIA_TENANT: "payments",
      VICTORIA_QUERY: "checkout_latency_bucket",
      VICTORIA_MAX_WINDOW_MS: "3600000",
      EVIDENCE_MAX_AGE_MS: "3600000",
      STATEMENT_TIMEOUT_MS: "5000",
      MAX_EVIDENCE_BYTES: "65536",
      MODEL_PROVIDER: "pi",
      MODEL_ID: "test-model",
      MODEL_THINKING: "medium",
      MODEL_API_KEY_ENV: "PI_API_KEY",
    })).toMatchObject({
      github: {
        repository: "acme/payments",
        pollIntervalMs: 30_000,
        publicationTimeoutMs: 30_000,
      },
      plan: {
        repositoryRoot: "/workspace/acme/payments",
        maxEvidenceBytes: 65_536,
      },
      model: {
        provider: "pi",
        modelId: "test-model",
      },
    })
  })
})
