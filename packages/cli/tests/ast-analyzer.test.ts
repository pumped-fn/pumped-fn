import { describe, it, expect } from "vitest";
import { ASTAnalyzer } from "../src/ast-analyzer.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("ASTAnalyzer", () => {
  const createTempProject = (files: Record<string, string>) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pumped-cli-test-"));
    
    // Create tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      },
      include: ["src/**/*"]
    };
    
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify(tsConfig, null, 2)
    );
    
    // Create src directory
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir);
    
    // Create files
    for (const [fileName, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(srcDir, fileName), content);
    }
    
    return tempDir;
  };

  it("should analyze simple provide executor", () => {
    const files = {
      "test.ts": `
        import { provide, meta, custom } from "@pumped-fn/core-next";
        
        const name = meta("name", custom<string>());
        
        const config = provide(
          () => ({ value: 42 }),
          name("config")
        );
      `
    };
    
    const tempDir = createTempProject(files);
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].name).toBe("config");
    expect(graph.nodes[0].type).toBe("provide");
    expect(graph.nodes[0].metaName).toBe("config");
    expect(graph.nodes[0].dependencies).toHaveLength(0);
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should analyze derive executor with dependencies", () => {
    const files = {
      "test.ts": `
        import { provide, derive, meta, custom } from "@pumped-fn/core-next";
        
        const name = meta("name", custom<string>());
        
        const config = provide(
          () => ({ value: 42 }),
          name("config")
        );
        
        const processor = derive(
          [config.reactive],
          ([configValue]) => {
            return configValue.value * 2;
          },
          name("processor")
        );
      `
    };
    
    const tempDir = createTempProject(files);
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    expect(graph.nodes).toHaveLength(2);
    
    const configNode = graph.nodes.find(n => n.name === "config");
    const processorNode = graph.nodes.find(n => n.name === "processor");
    
    expect(configNode).toBeDefined();
    expect(configNode!.type).toBe("provide");
    expect(configNode!.dependencies).toHaveLength(0);
    
    expect(processorNode).toBeDefined();
    expect(processorNode!.type).toBe("derive");
    expect(processorNode!.dependencies).toEqual(["config"]);
    
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ from: "config", to: "processor" });
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should handle multiple dependencies", () => {
    const files = {
      "test.ts": `
        import { provide, derive, meta, custom } from "@pumped-fn/core-next";
        
        const name = meta("name", custom<string>());
        
        const a = provide(() => 1, name("a"));
        const b = provide(() => 2, name("b"));
        
        const sum = derive(
          [a.static, b.static],
          ([aVal, bVal]) => aVal + bVal,
          name("sum")
        );
      `
    };
    
    const tempDir = createTempProject(files);
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    expect(graph.nodes).toHaveLength(3);
    
    const sumNode = graph.nodes.find(n => n.name === "sum");
    expect(sumNode).toBeDefined();
    expect(sumNode!.dependencies).toEqual(["a", "b"]);
    
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges).toContainEqual({ from: "a", to: "sum" });
    expect(graph.edges).toContainEqual({ from: "b", to: "sum" });
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should handle executors without meta names", () => {
    const files = {
      "test.ts": `
        import { provide } from "@pumped-fn/core-next";
        
        const unnamed = provide(() => 42);
      `
    };
    
    const tempDir = createTempProject(files);
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].name).toBe("unnamed");
    expect(graph.nodes[0].metaName).toBeUndefined();
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });
});