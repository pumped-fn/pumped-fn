import { DependencyGraph, ExecutorNode } from "./ast-analyzer.js";
import chalk from "chalk";

export interface TUIOptions {
  showFiles?: boolean;
  showTypes?: boolean;
  colorize?: boolean;
  compact?: boolean;
}

export class TUIVisualizer {
  constructor(private options: TUIOptions = {}) {
    this.options = {
      showFiles: false,
      showTypes: true,
      colorize: true,
      compact: false,
      ...options,
    };
  }

  visualize(graph: DependencyGraph): string {
    const lines: string[] = [];
    
    // Add header
    lines.push(this.formatHeader("🚀 Pumped-FN Dependency Graph"));
    lines.push("");
    
    // Add statistics
    lines.push(this.formatStats(graph));
    lines.push("");
    
    // Add tree visualization
    lines.push(this.formatTitle("📊 Dependency Tree"));
    lines.push("");
    
    const tree = this.buildTree(graph);
    lines.push(...this.renderTree(tree));
    
    // Add node details if not compact
    if (!this.options.compact) {
      lines.push("");
      lines.push(this.formatTitle("📝 Node Details"));
      lines.push("");
      lines.push(...this.renderNodeDetails(graph.nodes));
    }
    
    return lines.join("\n");
  }

  private formatHeader(text: string): string {
    if (!this.options.colorize) return text;
    return chalk.bold.cyan(text);
  }

  private formatTitle(text: string): string {
    if (!this.options.colorize) return text;
    return chalk.bold.yellow(text);
  }

  private formatStats(graph: DependencyGraph): string {
    const total = graph.nodes.length;
    const providers = graph.nodes.filter(n => n.type === "provide").length;
    const derivations = graph.nodes.filter(n => n.type === "derive").length;
    const dependencies = graph.edges.length;
    
    const stats = [
      `Total Executors: ${total}`,
      `Providers: ${providers}`,
      `Derivations: ${derivations}`,
      `Dependencies: ${dependencies}`
    ];
    
    if (this.options.colorize) {
      return stats.map(stat => {
        const [label, value] = stat.split(": ");
        return `${chalk.dim(label + ":")} ${chalk.bold.white(value)}`;
      }).join("  │  ");
    }
    
    return stats.join("  |  ");
  }

  private buildTree(graph: DependencyGraph): TreeNode[] {
    const nodeMap = new Map<string, ExecutorNode>();
    const incomingEdges = new Map<string, string[]>();
    
    // Build maps
    for (const node of graph.nodes) {
      nodeMap.set(node.name, node);
      incomingEdges.set(node.name, []);
    }
    
    for (const edge of graph.edges) {
      const deps = incomingEdges.get(edge.to) || [];
      deps.push(edge.from);
      incomingEdges.set(edge.to, deps);
    }
    
    // Find roots (nodes with no dependencies)
    const roots = graph.nodes.filter(node => 
      (incomingEdges.get(node.name) || []).length === 0
    );
    
    return roots.map(root => this.buildTreeNode(root, nodeMap, incomingEdges, new Set()));
  }

  private buildTreeNode(
    node: ExecutorNode, 
    nodeMap: Map<string, ExecutorNode>,
    incomingEdges: Map<string, string[]>,
    visited: Set<string>
  ): TreeNode {
    const children: TreeNode[] = [];
    
    if (!visited.has(node.name)) {
      visited.add(node.name);
      
      // Find nodes that depend on this one
      for (const [nodeName, deps] of incomingEdges.entries()) {
        if (deps.includes(node.name)) {
          const childNode = nodeMap.get(nodeName);
          if (childNode && !visited.has(nodeName)) {
            children.push(this.buildTreeNode(childNode, nodeMap, incomingEdges, new Set(visited)));
          }
        }
      }
    }
    
    return { node, children };
  }

  private renderTree(nodes: TreeNode[], prefix: string = "", isLast: boolean = true): string[] {
    const lines: string[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      const isLastNode = i === nodes.length - 1;
      const currentPrefix = i === 0 && prefix === "" ? "" : prefix + (isLastNode ? "└── " : "├── ");
      const nextPrefix = prefix + (isLastNode ? "    " : "│   ");
      
      lines.push(currentPrefix + this.formatNode(nodes[i].node));
      
      if (nodes[i].children.length > 0) {
        lines.push(...this.renderTree(nodes[i].children, nextPrefix, isLastNode));
      }
    }
    
    return lines;
  }

  private formatNode(node: ExecutorNode): string {
    let name = node.metaName || node.name;
    let typeInfo = "";
    let fileInfo = "";
    
    if (this.options.showTypes) {
      typeInfo = ` (${node.type})`;
    }
    
    if (this.options.showFiles) {
      const fileName = node.location.file.split("/").pop() || "";
      fileInfo = ` [${fileName}:${node.location.line}]`;
    }
    
    if (!this.options.colorize) {
      return name + typeInfo + fileInfo;
    }
    
    // Colorize based on type
    const coloredName = node.type === "provide" 
      ? chalk.blue(name)
      : chalk.magenta(name);
    
    const coloredType = typeInfo ? chalk.dim(typeInfo) : "";
    const coloredFile = fileInfo ? chalk.gray(fileInfo) : "";
    
    return coloredName + coloredType + coloredFile;
  }

  private renderNodeDetails(nodes: ExecutorNode[]): string[] {
    const lines: string[] = [];
    
    for (const node of nodes) {
      const name = this.options.colorize 
        ? chalk.bold(node.metaName || node.name)
        : node.metaName || node.name;
      
      lines.push(`${name}:`);
      lines.push(`  Type: ${node.type}`);
      lines.push(`  Location: ${node.location.file}:${node.location.line}:${node.location.column}`);
      
      if (node.dependencies.length > 0) {
        lines.push(`  Dependencies: ${node.dependencies.join(", ")}`);
      }
      
      if (node.metaName) {
        lines.push(`  Meta Name: ${node.metaName}`);
      }
      
      lines.push("");
    }
    
    return lines;
  }

  renderSummary(graph: DependencyGraph): string {
    const lines: string[] = [];
    
    // Analyze the graph
    const cycles = this.detectCycles(graph);
    const orphans = this.findOrphans(graph);
    const complexity = this.calculateComplexity(graph);
    
    lines.push(this.formatTitle("📈 Analysis Summary"));
    lines.push("");
    
    if (cycles.length > 0) {
      lines.push(this.options.colorize 
        ? chalk.red("⚠️  Circular dependencies detected:")
        : "⚠️  Circular dependencies detected:");
      
      for (const cycle of cycles) {
        lines.push(`   ${cycle.join(" → ")} → ${cycle[0]}`);
      }
      lines.push("");
    }
    
    if (orphans.length > 0) {
      lines.push(this.options.colorize 
        ? chalk.yellow("🔍 Orphaned nodes (no dependents):")
        : "🔍 Orphaned nodes (no dependents):");
      
      for (const orphan of orphans) {
        lines.push(`   ${orphan}`);
      }
      lines.push("");
    }
    
    lines.push(`Complexity Score: ${complexity}`);
    
    return lines.join("\n");
  }

  private detectCycles(graph: DependencyGraph): string[][] {
    // Simple cycle detection using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];
    
    const adjList = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!adjList.has(edge.from)) {
        adjList.set(edge.from, []);
      }
      adjList.get(edge.from)!.push(edge.to);
    }
    
    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);
      
      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, path);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          cycles.push(path.slice(cycleStart));
        }
      }
      
      recursionStack.delete(node);
      path.pop();
    };
    
    for (const node of graph.nodes) {
      if (!visited.has(node.name)) {
        dfs(node.name, []);
      }
    }
    
    return cycles;
  }

  private findOrphans(graph: DependencyGraph): string[] {
    const hasIncoming = new Set<string>();
    
    for (const edge of graph.edges) {
      hasIncoming.add(edge.to);
    }
    
    return graph.nodes
      .filter(node => !hasIncoming.has(node.name))
      .map(node => node.name);
  }

  private calculateComplexity(graph: DependencyGraph): number {
    // Simple complexity metric: edges / nodes
    return graph.nodes.length === 0 ? 0 : 
      Math.round((graph.edges.length / graph.nodes.length) * 100) / 100;
  }
}

interface TreeNode {
  node: ExecutorNode;
  children: TreeNode[];
}