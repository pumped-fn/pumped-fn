# @pumped-fn/devtools

Development tools for pumped-fn applications with real-time TUI visualization.

## Installation

```bash
pnpm add @pumped-fn/devtools
```

## Usage

```typescript
import { createScope } from "@pumped-fn/core-next"
import { createDevtoolsExtension, tuiExecutor } from "@pumped-fn/devtools"

// Create devtools extension
const devtoolsExt = createDevtoolsExtension()

// Add to your application scope
const appScope = createScope({ extensions: [devtoolsExt] })

// Optionally start TUI
const devtoolsScope = createScope()
const tui = await devtoolsScope.resolve(tuiExecutor)
tui.start()

// Your app runs normally, devtools visualizes in real-time
await appScope.resolve(yourExecutor)
```

## Features

- Real-time dependency graph visualization
- Flow execution timeline
- Executor resolution tracking
- Zero performance impact when not active
- Isolated devtools scope (doesn't pollute your app)

## License

MIT
