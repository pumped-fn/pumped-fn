import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    server: {
      deps: {
        inline: ['@pumped-fn/lite', '@pumped-fn/lite-react'],
      },
    },
  },
  resolve: {
    alias: {
      '@pumped-fn/lite': resolve(__dirname, '../lite/dist/index.mjs'),
      '@pumped-fn/lite-react': resolve(__dirname, '../lite-react/dist/index.mjs'),
    },
  },
  oxc: {
    include: [/packages\/lite-ui\/src\/.*\.[jt]sx?$/, /packages\/lite-ui\/tests\/.*\.[jt]sx?$/],
    jsx: {
      importSource: '@pumped-fn/lite-ui',
      runtime: 'automatic',
    },
  },
})
