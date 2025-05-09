# Pumped fn

A function on steroid. A practical library to provide multiple much needed orchestration for any application (frontend or backend)

# Quick start

```typescript
import { createScope, provide, derive } from "@pumped-fn/core-next"

const logLevel = provide(() => "debug")
const logger = derive(logLevel, () => )


```