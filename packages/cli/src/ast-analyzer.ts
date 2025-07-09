import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

export interface ExecutorNode {
  name: string;
  type: "provide" | "derive";
  dependencies: string[];
  location: {
    file: string;
    line: number;
    column: number;
  };
  metaName?: string;
}

export interface DependencyGraph {
  nodes: ExecutorNode[];
  edges: Array<{ from: string; to: string }>;
}

export class ASTAnalyzer {
  private program: ts.Program;
  private checker: ts.TypeChecker;
  private executors: ExecutorNode[] = [];

  constructor(private rootPath: string, private tsConfigPath?: string) {
    const configPath = tsConfigPath || this.findTsConfig(rootPath);
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    this.program = ts.createProgram({
      rootNames: parsedConfig.fileNames,
      options: parsedConfig.options,
    });
    this.checker = this.program.getTypeChecker();
  }

  private findTsConfig(dir: string): string {
    let currentDir = dir;
    while (currentDir !== path.dirname(currentDir)) {
      const tsConfigPath = path.join(currentDir, "tsconfig.json");
      if (fs.existsSync(tsConfigPath)) {
        return tsConfigPath;
      }
      currentDir = path.dirname(currentDir);
    }
    throw new Error("Could not find tsconfig.json");
  }

  analyze(): DependencyGraph {
    this.executors = [];
    
    for (const sourceFile of this.program.getSourceFiles()) {
      if (!sourceFile.isDeclarationFile) {
        this.visitNode(sourceFile);
      }
    }

    return this.buildGraph();
  }

  private visitNode(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      this.analyzeCallExpression(node);
    }
    ts.forEachChild(node, (child) => this.visitNode(child));
  }

  private analyzeCallExpression(node: ts.CallExpression): void {
    const expression = node.expression;
    
    if (ts.isIdentifier(expression)) {
      const functionName = expression.text;
      
      if (functionName === "provide" || functionName === "derive") {
        this.extractExecutor(node, functionName);
      }
    }
  }

  private extractExecutor(node: ts.CallExpression, type: "provide" | "derive"): void {
    const sourceFile = node.getSourceFile();
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    
    let dependencies: string[] = [];
    let metaName: string | undefined;

    // Extract dependencies for derive calls
    if (type === "derive" && node.arguments.length > 0) {
      const depsArg = node.arguments[0];
      dependencies = this.extractDependencies(depsArg);
    }

    // Extract meta name if present
    if (node.arguments.length > 1) {
      const lastArg = node.arguments[node.arguments.length - 1];
      metaName = this.extractMetaName(lastArg);
    }

    // Try to find the variable name this executor is assigned to
    const name = this.findVariableName(node) || `anonymous_${this.executors.length}`;

    this.executors.push({
      name,
      type,
      dependencies,
      location: {
        file: sourceFile.fileName,
        line: line + 1,
        column: character + 1,
      },
      metaName,
    });
  }

  private extractDependencies(node: ts.Node): string[] {
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements
        .map((element) => this.extractDependencyName(element))
        .filter((name): name is string => name !== undefined);
    }
    
    // Single dependency
    const name = this.extractDependencyName(node);
    return name ? [name] : [];
  }

  private extractDependencyName(node: ts.Node): string | undefined {
    if (ts.isPropertyAccessExpression(node)) {
      // Handle cases like "config.reactive" or "counter.static"
      if (ts.isIdentifier(node.expression)) {
        return node.expression.text;
      }
    }
    
    if (ts.isIdentifier(node)) {
      return node.text;
    }
    
    return undefined;
  }

  private extractMetaName(node: ts.Node): string | undefined {
    // Look for name("...") calls
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === "name") {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          return arg.text;
        }
      }
    }
    return undefined;
  }

  private findVariableName(node: ts.CallExpression): string | undefined {
    let parent = node.parent;
    
    while (parent) {
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      parent = parent.parent;
    }
    
    return undefined;
  }

  private buildGraph(): DependencyGraph {
    const edges: Array<{ from: string; to: string }> = [];
    
    for (const executor of this.executors) {
      for (const dep of executor.dependencies) {
        edges.push({ from: dep, to: executor.name });
      }
    }
    
    return {
      nodes: this.executors,
      edges,
    };
  }
}