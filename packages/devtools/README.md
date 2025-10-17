# @pumped-fn/devtools

Development tools for pumped-fn applications with real-time TUI visualization.

## Installation

```bash
pnpm add @pumped-fn/devtools
```

## Usage

### In-Memory Transport (Single Process)

```typescript
import { createScope } from "@pumped-fn/core-next"
import { createDevtoolsExtension, tuiExecutor } from "@pumped-fn/devtools"

const devtoolsExt = createDevtoolsExtension()
const appScope = createScope({ extensions: [devtoolsExt] })

const devtoolsScope = createScope()
const tui = await devtoolsScope.resolve(tuiExecutor)
tui.start()

await appScope.resolve(yourExecutor)
```

### IPC Transport (Multi-Process)

**1. Start devtools binary:**

```bash
# Global install
pnpm add -g @pumped-fn/devtools
pumped-cli

# Or local
pnpm add -D @pumped-fn/devtools
pnpm exec pumped-cli

# Custom socket path
pumped-cli --socket /tmp/custom.sock
```

**2. Configure your application:**

```typescript
import { createScope } from "@pumped-fn/core-next"
import { createDevtoolsExtension } from "@pumped-fn/devtools"

const devtoolsExt = createDevtoolsExtension({
  transport: "ipc",
  scopeName: "my-app", // Optional: name for this scope
  transportConfig: {
    // Optional: custom socket path (defaults to /tmp/pumped-fn-devtools-<user>.sock)
    socketPath: "/tmp/custom.sock",
    // Optional: retry interval in ms (default: 5000)
    retryInterval: 3000,
    // Optional: buffer size (default: 100)
    bufferSize: 200,
    // Optional: buffer strategy (default: "drop-old")
    bufferStrategy: "drop-old"
  }
})

const appScope = createScope({ extensions: [devtoolsExt] })
await appScope.resolve(yourExecutor)
```

## Features

- Real-time dependency graph visualization
- Flow execution timeline
- Executor resolution tracking
- Zero performance impact when not active
- Multi-scope monitoring via IPC transport
- Standalone binary (`pumped-cli`)
- Automatic retry and buffering when devtools unavailable

## License

MIT
