import { pumpedVite } from "@pumped-fn/lite-hmr"
import { tanstackStartBoundary } from "@pumped-fn/lite-tanstack-start/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    pumpedVite({ graph: true }),
    tanstackStart({
      router: {
        quoteStyle: "double",
        routeTreeFileHeader: [],
      },
    }),
    tanstackStartBoundary(),
  ],
})
