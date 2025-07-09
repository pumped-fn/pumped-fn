import { describe, it, expect } from "vitest";
import { MermaidGenerator } from "../src/mermaid-generator.js";
import { DependencyGraph } from "../src/ast-analyzer.js";

describe("MermaidGenerator", () => {
  const mockGraph: DependencyGraph = {
    nodes: [
      {
        name: "config",
        type: "provide",
        dependencies: [],
        location: { file: "test.ts", line: 5, column: 1 },
        metaName: "config"
      },
      {
        name: "processor",
        type: "derive",
        dependencies: ["config"],
        location: { file: "test.ts", line: 10, column: 1 },
        metaName: "processor"
      }
    ],
    edges: [
      { from: "config", to: "processor" }
    ]
  };

  it("should generate basic mermaid diagram", () => {
    const generator = new MermaidGenerator();
    const result = generator.generate(mockGraph);
    
    expect(result).toContain("graph TD");
    expect(result).toContain('config["config (provide)"]');
    expect(result).toContain('processor("processor (derive)")');
    expect(result).toContain("config --> processor");
    expect(result).toContain("classDef provide");
    expect(result).toContain("classDef derive");
  });

  it("should respect direction option", () => {
    const generator = new MermaidGenerator({ direction: "LR" });
    const result = generator.generate(mockGraph);
    
    expect(result).toContain("graph LR");
  });

  it("should include types when showTypes is true", () => {
    const generator = new MermaidGenerator({ showTypes: true });
    const result = generator.generate(mockGraph);
    
    expect(result).toContain("(provide)");
    expect(result).toContain("(derive)");
  });

  it("should exclude types when showTypes is false", () => {
    const generator = new MermaidGenerator({ showTypes: false });
    const result = generator.generate(mockGraph);
    
    expect(result).not.toContain("(provide)");
    expect(result).not.toContain("(derive)");
    expect(result).toContain('config["config"]');
    expect(result).toContain('processor("processor")');
  });

  it("should generate HTML with stats", () => {
    const generator = new MermaidGenerator();
    const html = generator.generateHTML(mockGraph, "Test Graph");
    
    expect(html).toContain("<title>Test Graph</title>");
    expect(html).toContain("Total Executors");
    expect(html).toContain('<div class="stat-value">2</div>');
    expect(html).toContain('<div class="stat-value">1</div>');
    expect(html).toContain("mermaid.initialize");
  });

  it("should sanitize node IDs", () => {
    const graphWithSpecialChars: DependencyGraph = {
      nodes: [
        {
          name: "node-with-dashes",
          type: "provide",
          dependencies: [],
          location: { file: "test.ts", line: 1, column: 1 },
          metaName: "node.with.dots"
        }
      ],
      edges: []
    };
    
    const generator = new MermaidGenerator();
    const result = generator.generate(graphWithSpecialChars);
    
    expect(result).toContain("node_with_dashes");
    expect(result).toContain('"node.with.dots (provide)"');
  });
});