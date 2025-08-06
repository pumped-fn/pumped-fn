# packages/cli/CLAUDE.md - CLI Tool (@pumped-fn/cli)

## When to Use This Context
- Analyzing pumped-fn dependency graphs in TypeScript projects
- Generating visual representations of executor dependencies
- Debugging complex dependency patterns and circular references
- Exporting dependency graphs as images or diagrams
- Building developer tools that analyze pumped-fn usage

## CLI Commands & Usage

### Main Commands
```bash
# Analyze dependency graph with TUI output
pumped-dag analyze [path]

# Generate image exports  
pumped-dag export [path] <output-file> --format <png|jpg|svg|pdf|webp>

# Validate dependency graph for issues
pumped-dag validate [path]

# Show dependency graph statistics
pumped-dag stats [path]
```

### CLI Entry Point
**File: `src/cli.ts`** - Main CLI interface and command definitions

## Core Architecture

### AST Analysis Engine

#### File: `src/ast-analyzer.ts` - TypeScript AST Analysis
**Key Classes:**
- **`ASTAnalyzer`** - Main analysis engine using TypeScript Compiler API
- **`ExecutorNode`** - Represents executor in dependency graph
- **`DependencyGraph`** - Complete graph representation with metadata

**Core Functionality:**
- Parses TypeScript files using TypeScript Compiler API
- Identifies `provide()`, `derive()`, and `preset()` calls
- Extracts dependency relationships between executors
- Handles complex patterns like conditional dependencies
- Supports both sync and async executor factories

**Analysis Features:**
- **Meta Extraction**: Captures executor names and metadata
- **Dependency Mapping**: Builds complete dependency graphs  
- **Cross-File Analysis**: Follows imports and exports
- **Pattern Recognition**: Identifies common pumped-fn patterns
- **Error Detection**: Finds circular dependencies and orphaned nodes

### Visualization System

#### File: `src/mermaid-generator.ts` - Mermaid Diagram Generation
**Key Class: `MermaidGenerator`**
- Converts dependency graphs to Mermaid syntax
- Supports multiple Mermaid themes (default, dark, forest, neutral)
- Handles complex graph layouts with proper node positioning
- Generates clickable nodes with metadata tooltips

**Mermaid Features:**
- **Graph Types**: Flowchart, dependency diagrams
- **Node Styling**: Different shapes for executor types
- **Edge Labels**: Dependency relationship information
- **Themes**: Built-in theme support for different contexts
- **Complexity Handling**: Manages large graphs with clustering

#### File: `src/image-generator.ts` - High-Quality Image Export
**Key Class: `ImageGenerator`**
- Uses Puppeteer for browser-based rendering
- Supports multiple formats: PNG, JPG, SVG, PDF, WebP
- High-resolution output with configurable DPI
- Handles large graphs with automatic scaling

**Image Generation Pipeline:**
1. Generate Mermaid diagram syntax
2. Create HTML page with Mermaid rendering
3. Launch headless browser with Puppeteer
4. Render diagram and capture output
5. Export in requested format with optimization

### Terminal UI System

#### File: `src/tui-visualizer.ts` - Terminal User Interface
**Key Class: `TUIVisualizer`**
- Interactive terminal-based dependency graph explorer
- Keyboard navigation through dependency tree
- Real-time filtering and search capabilities
- Detailed executor information display

**TUI Features:**
- **Interactive Navigation**: Arrow keys, vim-style navigation
- **Filtering**: Real-time filter by executor name or type
- **Detail Panels**: Show executor metadata and dependencies
- **Export Options**: Quick export from TUI interface
- **Performance**: Handles large graphs efficiently

## Testing Infrastructure

### Test Files
- **`tests/ast-analyzer.test.ts`** - AST analysis engine testing
- **`tests/mermaid-generator.test.ts`** - Diagram generation testing
- **`tests/image-generator.test.ts`** - Image export testing
- **`tests/complex-scenario.test.ts`** - End-to-end complex graph testing

### Testing Utilities
**Common Pattern:**
```typescript
const createTempProject = (files: Record<string, string>) => {
  // Creates temporary TypeScript project for testing
  // Includes proper tsconfig.json configuration
  // Returns cleanup function for test isolation
};
```

**Test Scenarios:**
- Simple executor chains
- Complex multi-file projects
- Circular dependency detection
- Large-scale graph performance
- Cross-file import resolution

## Programmatic API

### Main Exports (`src/index.ts`)
```typescript
export { ASTAnalyzer } from "./ast-analyzer.js";
export { MermaidGenerator } from "./mermaid-generator.js";  
export { TUIVisualizer } from "./tui-visualizer.js";
export { ImageGenerator } from "./image-generator.js";

// Type exports
export type { ExecutorNode, DependencyGraph } from "./ast-analyzer.js";
export type { MermaidOptions } from "./mermaid-generator.js";
export type { TUIOptions } from "./tui-visualizer.js";
export type { ImageFormat, ImageGeneratorOptions } from "./image-generator.js";
```

### Usage as Library
```typescript
import { ASTAnalyzer, MermaidGenerator, ImageGenerator } from '@pumped-fn/cli';

// Analyze project
const analyzer = new ASTAnalyzer();
const graph = await analyzer.analyzeProject('./src');

// Generate diagram
const mermaidGen = new MermaidGenerator();
const diagram = mermaidGen.generateDiagram(graph);

// Export image
const imageGen = new ImageGenerator();
await imageGen.generateImage(diagram, 'output.png', { format: 'png' });
```

## Development Workflow

### Local Development
```bash
# Build CLI
cd packages/cli && pnpm build

# Test CLI locally
node dist/cli.js analyze ./examples/react/src/

# Run tests
pnpm test

# Generate test images  
node dist/cli.js export ./examples/react/src/ graph.png --format png --theme dark
```

### Generated Artifacts
The CLI generates several example outputs:
- **`complex-app-architecture.png`** - Example complex application graph
- **`graph.pdf`**, **`graph.png`**, **`graph.svg`** - Sample export formats
- **`test-graph.jpg`** - Test output validation

## Advanced Features

### Cross-Reference Support
- Handles executors defined across multiple files
- Follows TypeScript import/export chains
- Resolves re-exported executors from barrel files
- Manages complex module dependency patterns

### Performance Optimization
- Incremental analysis for large codebases
- Caching of parsed TypeScript programs
- Memory-efficient graph representation
- Parallel processing for multi-file analysis

### Error Handling & Validation
- Detects circular dependencies with path information
- Identifies orphaned executors (no dependents)
- Reports complexity metrics and warnings
- Provides actionable error messages with file locations

## Build Configuration
- **`tsconfig.json`** - TypeScript with Node.js targeting
- **`tsup.config.ts`** - Bundle configuration with CLI executable
- **`vitest.config.ts`** - Testing with temporary file system
- Executable binary generation with proper shebang headers