export function buildConfig(target: "server" | "cli") {
  const entry = target === "server" ? "virtual:pumped/entry-server" : "virtual:pumped/entry-cli"

  return {
    build: {
      ssr: true as const,
      outDir: "dist",
      emptyOutDir: false,
      rollupOptions: {
        input: entry,
        output: { entryFileNames: `${target}.mjs` },
      },
    },
  }
}
