import { DependencyGraph, ExecutorNode } from "./ast-analyzer.js";

export interface MermaidOptions {
  theme?: "default" | "dark" | "forest" | "neutral";
  direction?: "TD" | "LR" | "BT" | "RL";
  showTypes?: boolean;
  showFiles?: boolean;
}

export class MermaidGenerator {
  constructor(private options: MermaidOptions = {}) {
    this.options = {
      theme: "default",
      direction: "TD",
      showTypes: true,
      showFiles: false,
      ...options,
    };
  }

  generate(graph: DependencyGraph): string {
    const lines: string[] = [];
    
    // Add diagram header
    lines.push(`graph ${this.options.direction}`);
    
    // Add theme if specified
    if (this.options.theme && this.options.theme !== "default") {
      lines.push(`  %%{init: {"theme": "${this.options.theme}"}}%%`);
    }
    
    // Add nodes with styling
    for (const node of graph.nodes) {
      const nodeId = this.sanitizeNodeId(node.name);
      const label = this.createNodeLabel(node);
      const shape = this.getNodeShape(node);
      const cssClass = this.getNodeClass(node);
      
      lines.push(`  ${nodeId}${shape.start}"${label}"${shape.end}`);
      
      if (cssClass) {
        lines.push(`  class ${nodeId} ${cssClass}`);
      }
    }
    
    // Add edges
    for (const edge of graph.edges) {
      const fromId = this.sanitizeNodeId(edge.from);
      const toId = this.sanitizeNodeId(edge.to);
      lines.push(`  ${fromId} --> ${toId}`);
    }
    
    // Add CSS classes
    lines.push("");
    lines.push("  classDef provide fill:#e1f5fe,stroke:#01579b,stroke-width:2px");
    lines.push("  classDef derive fill:#f3e5f5,stroke:#4a148c,stroke-width:2px");
    lines.push("  classDef anonymous fill:#fff3e0,stroke:#e65100,stroke-width:2px,stroke-dasharray: 5 5");
    
    return lines.join("\n");
  }

  private sanitizeNodeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  private createNodeLabel(node: ExecutorNode): string {
    let label = node.metaName || node.name;
    
    if (this.options.showTypes) {
      label += ` (${node.type})`;
    }
    
    if (this.options.showFiles) {
      const fileName = node.location.file.split("/").pop() || "";
      label += `\\n${fileName}:${node.location.line}`;
    }
    
    return label;
  }

  private getNodeShape(node: ExecutorNode): { start: string; end: string } {
    switch (node.type) {
      case "provide":
        return { start: "[", end: "]" }; // Rectangle
      case "derive":
        return { start: "(", end: ")" }; // Rounded rectangle
      default:
        return { start: "[", end: "]" };
    }
  }

  private getNodeClass(node: ExecutorNode): string {
    if (node.name.startsWith("anonymous_")) {
      return "anonymous";
    }
    return node.type;
  }

  generateHTML(graph: DependencyGraph, title: string = "Pumped-FN Dependency Graph"): string {
    const mermaidCode = this.generate(graph);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
        }
        .mermaid {
            text-align: center;
        }
        .stats {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
        }
        .stat {
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #007acc;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${title}</h1>
        <div class="mermaid">
${mermaidCode}
        </div>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${graph.nodes.length}</div>
                <div class="stat-label">Total Executors</div>
            </div>
            <div class="stat">
                <div class="stat-value">${graph.nodes.filter(n => n.type === "provide").length}</div>
                <div class="stat-label">Providers</div>
            </div>
            <div class="stat">
                <div class="stat-value">${graph.nodes.filter(n => n.type === "derive").length}</div>
                <div class="stat-label">Derivations</div>
            </div>
            <div class="stat">
                <div class="stat-value">${graph.edges.length}</div>
                <div class="stat-label">Dependencies</div>
            </div>
        </div>
    </div>

    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: '${this.options.theme}',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            }
        });
    </script>
</body>
</html>`;
  }
}