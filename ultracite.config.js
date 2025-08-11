import { defineConfig } from 'ultracite';

export default defineConfig({
  // Format configuration
  format: {
    enabled: true,
    indentStyle: 'tab',
    indentWidth: 2,
    lineWidth: 100,
    quoteStyle: 'single',
    semicolons: 'always',
    trailingComma: 'all',
    arrowParens: 'always',
    bracketSpacing: true,
    printWidth: 100,
  },

  // Lint configuration
  lint: {
    enabled: true,
    rules: {
      // TypeScript specific rules
      'no-explicit-any': 'warn',
      'no-unused-vars': 'error',
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      
      // React specific rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // File patterns
  include: [
    'packages/**/*.{js,jsx,ts,tsx,json,md}',
    'docs/**/*.{js,jsx,ts,tsx,json,md}',
    'examples/**/*.{js,jsx,ts,tsx,json,md}',
    '*.{js,json,md}',
  ],

  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/out/**',
    '**/coverage/**',
    '**/.changeset/**',
    'pnpm-lock.yaml',
  ],

  // TypeScript configuration
  typescript: {
    enabled: true,
    checkJs: false,
  },

  // Organize imports
  organizeImports: {
    enabled: true,
  },
});