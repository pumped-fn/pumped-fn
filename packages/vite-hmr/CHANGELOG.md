# @pumped-fn/vite-hmr

## 0.1.0

### Minor Changes

- 954d9d9: Add @pumped-fn/vite-hmr package for HMR compatibility

  - Vite plugin that preserves atom state across hot module reloads
  - Build-time AST transform wraps atom declarations with registry helper
  - Runtime stores atom refs in import.meta.hot.data for reference stability
  - Automatically disabled in production builds
