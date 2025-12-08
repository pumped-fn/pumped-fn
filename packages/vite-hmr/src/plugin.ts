import type { Plugin } from "vite"
import { transformAtoms } from "./transform"

export interface PumpedHmrOptions {
  include?: RegExp
  exclude?: RegExp
}

/**
 * Vite plugin that transforms atom declarations for HMR preservation.
 * Automatically disabled in production builds.
 */
export function pumpedHmr(options: PumpedHmrOptions = {}): Plugin {
  const {
    include = /\.[jt]sx?$/,
    exclude = /node_modules/,
  } = options

  return {
    name: "pumped-fn-hmr",
    enforce: "pre",

    transform(code, id) {
      if (process.env.NODE_ENV === "production") {
        return null
      }

      if (!include.test(id)) {
        return null
      }

      if (exclude.test(id)) {
        return null
      }

      if (!code.includes("atom(")) {
        return null
      }

      return transformAtoms(code, id)
    },
  }
}
