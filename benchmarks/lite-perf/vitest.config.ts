import { createHash } from "node:crypto"
import { appendFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { playwright } from "@vitest/browser-playwright"
import { configDefaults, defineConfig } from "vitest/config"

const liteDist = fileURLToPath(
  new URL("../../pkg/core/lite/dist/index.mjs", import.meta.url),
)
const liteReactDist = fileURLToPath(
  new URL("../../pkg/react/lite-react/dist/index.mjs", import.meta.url),
)
const benchmarkRoot = fileURLToPath(new URL(".", import.meta.url))
const resolutionTrace = process.env.PUMPED_PERF_RESOLUTION_TRACE

function trace(value: string) {
  if (resolutionTrace) appendFileSync(resolutionTrace, `${value}\n`)
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function packedDistPlugin() {
  return {
    name: "packed-dist-resolution-transform-proof",
    enforce: "pre" as const,
    resolveId(source: string) {
      const path = source === "@pumped-fn/lite"
        ? liteDist
        : source === "@pumped-fn/lite-react"
          ? liteReactDist
          : null
      if (path) trace(`PACKED_DIST_RESOLVE=${source}->${path}`)
      return path
    },
    transform(code: string, id: string) {
      const path = id.split("?")[0]
      if (path.startsWith(`${benchmarkRoot}bench/`)) trace(`BENCH_TRANSFORM=${path}`)
      if (path === liteDist || path === liteReactDist) {
        trace(`PACKED_DIST_TRANSFORM=${path}:sha256=${sha256(code)}`)
      }
    },
  }
}

const builtDistResolution = {
  dedupe: ["react", "react-dom"],
}

export default defineConfig({
  resolve: builtDistResolution,
  test: {
    server: {
      deps: {
        inline: true,
      },
    },
    projects: [
      {
        plugins: [packedDistPlugin()],
        resolve: builtDistResolution,
        test: {
          name: "node",
          include: ["**/*.test.ts", "**/*.bench.ts"],
          exclude: [
            ...configDefaults.exclude,
            "**/*.browser.test.tsx",
            "**/*.browser.bench.tsx",
          ],
          environment: "node",
          globals: true,
          server: {
            deps: {
              inline: true,
            },
          },
        },
      },
      {
        plugins: [packedDistPlugin()],
        resolve: builtDistResolution,
        test: {
          name: "browser",
          include: ["**/*.browser.test.tsx", "**/*.browser.bench.tsx"],
          globals: true,
          server: {
            deps: {
              inline: true,
            },
          },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
