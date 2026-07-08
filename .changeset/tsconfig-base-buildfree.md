---
---

Build tooling only: consolidated every package onto a shared `tsconfig.base.json` so a fresh checkout typechecks without building `dist` first. No published output changes — `tsconfig.json` is not shipped, and the one `@pumped-fn/lite-hmr` source touch (`process.env['NODE_ENV']`) compiles to identical JS.
