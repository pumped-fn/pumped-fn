# @pumped-fn/cli

A command-line tool for analyzing and visualizing dependency graphs in pumped-fn projects.

## Installation

```bash
npm install -g @pumped-fn/cli
# or
pnpm add -g @pumped-fn/cli
```

## Usage

### Analyze Command

Analyze TypeScript files for pumped-fn usage and visualize dependency graphs:

```bash
# Analyze current directory with TUI output
pumped-dag analyze

# Analyze specific path
pumped-dag analyze ./src

# Generate Mermaid diagram
pumped-dag analyze --output mermaid

# Generate HTML visualization
pumped-dag analyze --output html --file graph.html

# Export as JSON
pumped-dag analyze --output json --file graph.json

# Generate image files
pumped-dag analyze --output png --file graph.png
pumped-dag analyze --output jpg --file graph.jpg --quality 95
pumped-dag analyze --output svg --file graph.svg
```

### Options

- `--config, -c <path>` - Path to tsconfig.json
- `--output, -o <format>` - Output format: `tui`, `mermaid`, `html`, `json`, `png`, `jpg`, `svg`, `pdf`, `webp` (default: `tui`)
- `--file, -f <path>` - Output file path
- `--theme <theme>` - Mermaid theme: `default`, `dark`, `forest`, `neutral`
- `--direction <dir>` - Mermaid direction: `TD`, `LR`, `BT`, `RL`
- `--show-types` - Show executor types in output
- `--show-files` - Show file locations in output
- `--no-color` - Disable colored output
- `--compact` - Use compact output format

#### Image Export Options

- `--width <width>` - Image width in pixels (default: 1920)
- `--height <height>` - Image height in pixels (default: 1080)  
- `--quality <quality>` - Image quality 0-100 for JPG/WebP (default: 90)
- `--transparent` - Transparent background for PNG images

### Validate Command

Check dependency graph for potential issues:

```bash
pumped-dag validate
```

This will detect:
- Circular dependencies
- Orphaned executors (no dependents)
- Anonymous executors

### Stats Command

Show detailed statistics about your dependency graph:

```bash
pumped-dag stats
```

Displays:
- Total number of executors
- Number of providers vs derivations
- Number of files analyzed
- Dependency complexity
- Maximum depth
- Issue counts

### Export Command

Export dependency graphs as high-quality images:

```bash
# Export as PNG
pumped-dag export ./src graph.png

# Export as JPG with custom quality
pumped-dag export ./src graph.jpg --format jpg --quality 95

# Export as SVG (vector format)
pumped-dag export ./src graph.svg --format svg

# Export as PDF
pumped-dag export ./src graph.pdf --format pdf

# Custom dimensions and transparent background
pumped-dag export ./src graph.png --width 2560 --height 1440 --transparent
```

Options:
- `--format, -f <format>` - Image format: `png`, `jpg`, `svg`, `pdf`, `webp` (default: `png`)
- `--width <width>` - Image width in pixels (default: 1920)
- `--height <height>` - Image height in pixels (default: 1080)
- `--quality <quality>` - Image quality 0-100 for JPG/WebP (default: 90)
- `--transparent` - Transparent background for PNG images
- `--theme <theme>` - Mermaid theme
- `--direction <dir>` - Diagram direction
- `--show-types` - Show executor types
- `--show-files` - Show file locations

## Examples

### Basic Analysis

```bash
pumped-dag analyze ./src
```

Output:
```
🚀 Pumped-FN Dependency Graph

Total Executors: 4  │  Providers: 2  │  Derivations: 2  │  Dependencies: 3

📊 Dependency Tree

config (provide)
└── configController (derive)
timer (provide)
└── timer (derive)
    └── counter (provide)

📈 Analysis Summary

Complexity Score: 0.75
```

### Generate HTML Visualization

```bash
pumped-dag analyze --output html --file dependency-graph.html --theme dark
```

Creates an interactive HTML file with a Mermaid diagram and statistics.

### Export High-Quality Images

```bash
# Generate PNG for documentation
pumped-dag export ./src dependency-graph.png --theme dark --transparent

# Generate JPG for presentations
pumped-dag export ./src dependency-graph.jpg --quality 95 --width 3840 --height 2160

# Generate SVG for scalable graphics
pumped-dag export ./src dependency-graph.svg --show-types --show-files

# Generate PDF for reports
pumped-dag export ./src dependency-graph.pdf
```

### Validate for Issues

```bash
pumped-dag validate
```

Output:
```
⚠️  Issues found:
   • 1 circular dependency cycle(s) detected
   • 2 orphaned executor(s) found

📈 Analysis Summary

⚠️  Circular dependencies detected:
   config → processor → config

🔍 Orphaned nodes (no dependents):
   logger
   metrics
```

## API

You can also use the CLI components programmatically:

```typescript
import { 
  ASTAnalyzer, 
  MermaidGenerator, 
  TUIVisualizer, 
  ImageGenerator 
} from "@pumped-fn/cli";

// Analyze TypeScript files
const analyzer = new ASTAnalyzer("./src");
const graph = analyzer.analyze();

// Generate Mermaid diagram
const mermaidGen = new MermaidGenerator({ theme: "dark" });
const diagram = mermaidGen.generate(graph);

// Create TUI visualization
const tuiViz = new TUIVisualizer({ colorize: true });
const output = tuiViz.visualize(graph);

// Generate images
const imageGen = new ImageGenerator({ theme: "dark" });
await imageGen.generateImage(graph, "graph.png", {
  format: "png",
  width: 1920,
  height: 1080,
  transparent: true
});

// Export as PDF
await imageGen.generateImage(graph, "graph.pdf", {
  format: "pdf",
  width: 2480,
  height: 3508 // A4 size in pixels
});
```

## How It Works

The CLI uses TypeScript's compiler API to:

1. **Parse TypeScript files** - Analyzes your source code to find pumped-fn usage
2. **Extract executors** - Identifies `provide()` and `derive()` calls
3. **Build dependency graph** - Maps relationships between executors
4. **Visualize results** - Outputs in various formats (TUI, Mermaid, HTML, JSON)

### Supported Patterns

The analyzer recognizes these pumped-fn patterns:

```typescript
// Providers
const config = provide(() => ({ value: 42 }), name("config"));

// Derivations with single dependency
const doubled = derive(config.reactive, (val) => val * 2, name("doubled"));

// Derivations with multiple dependencies
const sum = derive([a.static, b.static], ([a, b]) => a + b, name("sum"));

// Different executor variants
const lazy = config.lazy;
const reactive = config.reactive;
const static = config.static;
```

## Requirements

- Node.js 18+
- TypeScript project with valid tsconfig.json
- Uses @pumped-fn/core-next

## Supported Image Formats

| Format | Extension | Use Case | Features |
|--------|-----------|----------|----------|
| **PNG** | `.png` | Documentation, transparency needed | Lossless, supports transparency |
| **JPG/JPEG** | `.jpg`, `.jpeg` | Presentations, smaller file size | Lossy compression, quality control |
| **SVG** | `.svg` | Scalable graphics, web use | Vector format, infinite scalability |
| **PDF** | `.pdf` | Reports, printing | Document format, vector-based |
| **WebP** | `.webp` | Modern web, best compression | Supports transparency, superior compression |

### Image Quality Guidelines

- **PNG**: Best for diagrams with text and solid colors
- **JPG**: Use quality 85-95 for good balance of size/quality
- **SVG**: Perfect for scalable diagrams, smallest file size
- **PDF**: Ideal for including in reports and documents
- **WebP**: Best overall compression with transparency support

## Requirements

- Node.js 18+
- TypeScript project with valid tsconfig.json
- Uses @pumped-fn/core-next
- For image generation: Chrome/Chromium (automatically installed by Puppeteer)

## License

MIT