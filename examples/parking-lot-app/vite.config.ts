import { defineConfig } from "vite"
import { pumped } from "@pumped-fn/pumped"

export default defineConfig({
  plugins: [pumped.plugin()],
})
