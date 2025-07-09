import { Command } from "commander";
import { ASTAnalyzer } from "./ast-analyzer.js";
import { MermaidGenerator } from "./mermaid-generator.js";
import { TUIVisualizer } from "./tui-visualizer.js";
import { ImageGenerator, ImageFormat } from "./image-generator.js";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";

const program = new Command();

program
  .name("pumped-dag")
  .description("Analyze and visualize pumped-fn dependency graphs")
  .version("0.1.0");

program
  .command("analyze")
  .description("Analyze TypeScript files for pumped-fn usage")
  .argument("[path]", "Path to analyze", ".")
  .option("-c, --config <path>", "Path to tsconfig.json")
  .option("-o, --output <format>", "Output format: tui, mermaid, html, json, png, jpg, svg, pdf, webp", "tui")
  .option("-f, --file <path>", "Output file path")
  .option("--theme <theme>", "Mermaid theme: default, dark, forest, neutral", "default")
  .option("--direction <dir>", "Mermaid direction: TD, LR, BT, RL", "TD")
  .option("--show-types", "Show executor types in output")
  .option("--show-files", "Show file locations in output")
  .option("--no-color", "Disable colored output")
  .option("--compact", "Use compact output format")
  .option("--width <width>", "Image width (for image formats)", "1920")
  .option("--height <height>", "Image height (for image formats)", "1080")
  .option("--quality <quality>", "Image quality 0-100 (for jpg/webp)", "90")
  .option("--transparent", "Transparent background (for png)")
  .action(async (sourcePath, options) => {
    const spinner = ora("Analyzing TypeScript files...").start();
    
    try {
      const analyzer = new ASTAnalyzer(sourcePath, options.config);
      const graph = analyzer.analyze();
      
      spinner.succeed(`Found ${graph.nodes.length} executors with ${graph.edges.length} dependencies`);
      
      if (graph.nodes.length === 0) {
        console.log(chalk.yellow("⚠️  No pumped-fn executors found in the specified path."));
        console.log(chalk.dim("Make sure you're analyzing a project that uses @pumped-fn/core-next"));
        return;
      }
      
      let output: string;
      
      // Check if output format is an image format
      const imageFormats = ["png", "jpg", "jpeg", "svg", "pdf", "webp"];
      const isImageFormat = imageFormats.includes(options.output);
      
      if (isImageFormat) {
        // Handle image generation
        if (!options.file) {
          console.error(chalk.red("Error: Output file path is required for image formats"));
          console.log(chalk.dim("Use -f or --file option to specify output path"));
          process.exit(1);
        }
        
        const imageGenerator = new ImageGenerator({
          theme: options.theme,
          direction: options.direction,
          showTypes: options.showTypes,
          showFiles: options.showFiles,
        });
        
        spinner.text = "Generating image...";
        
        await imageGenerator.generateImage(graph, options.file, {
          format: options.output as ImageFormat,
          width: parseInt(options.width),
          height: parseInt(options.height),
          quality: parseInt(options.quality),
          transparent: options.transparent || false,
        });
        
        console.log(chalk.green(`✅ Image saved to: ${options.file}`));
        return;
      }
      
      // Handle text-based outputs
      switch (options.output) {
        case "json":
          output = JSON.stringify(graph, null, 2);
          break;
          
        case "mermaid": {
          const generator = new MermaidGenerator({
            theme: options.theme,
            direction: options.direction,
            showTypes: options.showTypes,
            showFiles: options.showFiles,
          });
          output = generator.generate(graph);
          break;
        }
        
        case "html": {
          const generator = new MermaidGenerator({
            theme: options.theme,
            direction: options.direction,
            showTypes: options.showTypes,
            showFiles: options.showFiles,
          });
          output = generator.generateHTML(graph);
          break;
        }
        
        case "tui":
        default: {
          const visualizer = new TUIVisualizer({
            showFiles: options.showFiles,
            showTypes: options.showTypes,
            colorize: options.color !== false,
            compact: options.compact,
          });
          
          output = visualizer.visualize(graph);
          
          // Also show analysis summary
          const summary = visualizer.renderSummary(graph);
          if (summary.trim()) {
            output += "\n\n" + summary;
          }
          break;
        }
      }
      
      if (options.file) {
        const outputPath = path.resolve(options.file);
        await fs.promises.writeFile(outputPath, output, "utf-8");
        console.log(chalk.green(`✅ Output saved to: ${outputPath}`));
      } else {
        console.log(output);
      }
      
    } catch (error) {
      spinner.fail("Analysis failed");
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate dependency graph for issues")
  .argument("[path]", "Path to analyze", ".")
  .option("-c, --config <path>", "Path to tsconfig.json")
  .option("--no-color", "Disable colored output")
  .action(async (sourcePath, options) => {
    const spinner = ora("Validating dependency graph...").start();
    
    try {
      const analyzer = new ASTAnalyzer(sourcePath, options.config);
      const graph = analyzer.analyze();
      
      const visualizer = new TUIVisualizer({
        colorize: options.color !== false,
      });
      
      // Detect issues
      const issues: string[] = [];
      
      // Check for cycles
      const cycles = detectCycles(graph);
      if (cycles.length > 0) {
        issues.push(`${cycles.length} circular dependency cycle(s) detected`);
      }
      
      // Check for orphaned nodes
      const orphans = findOrphans(graph);
      if (orphans.length > 0) {
        issues.push(`${orphans.length} orphaned executor(s) found`);
      }
      
      // Check for anonymous executors
      const anonymous = graph.nodes.filter(n => n.name.startsWith("anonymous_"));
      if (anonymous.length > 0) {
        issues.push(`${anonymous.length} anonymous executor(s) found`);
      }
      
      spinner.stop();
      
      if (issues.length === 0) {
        console.log(chalk.green("✅ No issues found in dependency graph"));
      } else {
        console.log(chalk.yellow("⚠️  Issues found:"));
        for (const issue of issues) {
          console.log(`   • ${issue}`);
        }
        console.log("");
        console.log(visualizer.renderSummary(graph));
      }
      
    } catch (error) {
      spinner.fail("Validation failed");
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("stats")
  .description("Show statistics about the dependency graph")
  .argument("[path]", "Path to analyze", ".")
  .option("-c, --config <path>", "Path to tsconfig.json")
  .option("--no-color", "Disable colored output")
  .action(async (sourcePath, options) => {
    const spinner = ora("Calculating statistics...").start();
    
    try {
      const analyzer = new ASTAnalyzer(sourcePath, options.config);
      const graph = analyzer.analyze();
      
      spinner.stop();
      
      const stats = calculateStats(graph);
      displayStats(stats, options.color !== false);
      
    } catch (error) {
      spinner.fail("Statistics calculation failed");
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Helper functions
function detectCycles(graph: any): string[][] {
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

function findOrphans(graph: any): string[] {
  const hasIncoming = new Set<string>();
  
  for (const edge of graph.edges) {
    hasIncoming.add(edge.to);
  }
  
  return graph.nodes
    .filter((node: any) => !hasIncoming.has(node.name))
    .map((node: any) => node.name);
}

function calculateStats(graph: any) {
  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;
  const providers = graph.nodes.filter((n: any) => n.type === "provide").length;
  const derivations = graph.nodes.filter((n: any) => n.type === "derive").length;
  
  const fileCount = new Set(graph.nodes.map((n: any) => n.location.file)).size;
  
  const complexity = totalNodes === 0 ? 0 : totalEdges / totalNodes;
  
  // Calculate depth
  const depths = new Map<string, number>();
  const calculateDepth = (nodeName: string, visited = new Set()): number => {
    if (visited.has(nodeName)) return 0;
    if (depths.has(nodeName)) return depths.get(nodeName)!;
    
    visited.add(nodeName);
    const dependencies = graph.edges
      .filter((e: any) => e.to === nodeName)
      .map((e: any) => e.from);
    
    const maxDepth = dependencies.length === 0 ? 0 : 
      Math.max(...dependencies.map((dep: string) => calculateDepth(dep, new Set(visited)))) + 1;
    
    depths.set(nodeName, maxDepth);
    return maxDepth;
  };
  
  const maxDepth = graph.nodes.length === 0 ? 0 : 
    Math.max(...graph.nodes.map((n: any) => calculateDepth(n.name)));
  
  return {
    totalNodes,
    totalEdges,
    providers,
    derivations,
    fileCount,
    complexity: Math.round(complexity * 100) / 100,
    maxDepth,
    cycles: detectCycles(graph).length,
    orphans: findOrphans(graph).length,
  };
}

function displayStats(stats: any, colorize: boolean) {
  const format = (label: string, value: string | number) => {
    if (colorize) {
      return `${chalk.dim(label + ":")} ${chalk.bold.white(value)}`;
    }
    return `${label}: ${value}`;
  };
  
  console.log(colorize ? chalk.bold.cyan("📊 Dependency Graph Statistics") : "📊 Dependency Graph Statistics");
  console.log("");
  console.log(format("Total Executors", stats.totalNodes));
  console.log(format("Dependencies", stats.totalEdges));
  console.log(format("Providers", stats.providers));
  console.log(format("Derivations", stats.derivations));
  console.log(format("Files", stats.fileCount));
  console.log(format("Max Depth", stats.maxDepth));
  console.log(format("Complexity", stats.complexity));
  
  if (stats.cycles > 0) {
    console.log(colorize ? chalk.red(format("Cycles", stats.cycles)) : format("Cycles", stats.cycles));
  }
  
  if (stats.orphans > 0) {
    console.log(colorize ? chalk.yellow(format("Orphans", stats.orphans)) : format("Orphans", stats.orphans));
  }
}

program
  .command("export")
  .description("Export dependency graph as image")
  .argument("[path]", "Path to analyze", ".")
  .argument("<output>", "Output file path")
  .option("-c, --config <path>", "Path to tsconfig.json")
  .option("-f, --format <format>", "Image format: png, jpg, svg, pdf, webp", "png")
  .option("--theme <theme>", "Mermaid theme: default, dark, forest, neutral", "default")
  .option("--direction <dir>", "Mermaid direction: TD, LR, BT, RL", "TD")
  .option("--show-types", "Show executor types in output")
  .option("--show-files", "Show file locations in output")
  .option("--width <width>", "Image width", "1920")
  .option("--height <height>", "Image height", "1080")
  .option("--quality <quality>", "Image quality 0-100 (for jpg/webp)", "90")
  .option("--transparent", "Transparent background (for png)")
  .action(async (sourcePath, outputPath, options) => {
    const spinner = ora("Analyzing TypeScript files...").start();
    
    try {
      // Validate format
      if (!ImageGenerator.validateFormat(options.format)) {
        console.error(chalk.red(`Error: Unsupported format '${options.format}'`));
        console.log(chalk.dim(`Supported formats: ${ImageGenerator.getSupportedFormats().join(", ")}`));
        process.exit(1);
      }
      
      const analyzer = new ASTAnalyzer(sourcePath, options.config);
      const graph = analyzer.analyze();
      
      spinner.succeed(`Found ${graph.nodes.length} executors with ${graph.edges.length} dependencies`);
      
      if (graph.nodes.length === 0) {
        console.log(chalk.yellow("⚠️  No pumped-fn executors found in the specified path."));
        console.log(chalk.dim("Make sure you're analyzing a project that uses @pumped-fn/core-next"));
        return;
      }
      
      const imageGenerator = new ImageGenerator({
        theme: options.theme,
        direction: options.direction,
        showTypes: options.showTypes,
        showFiles: options.showFiles,
      });
      
      spinner.text = "Generating image...";
      
      // Auto-add extension if not present
      const formatInfo = ImageGenerator.getFormatInfo(options.format);
      const finalOutputPath = outputPath.endsWith(formatInfo.extension) 
        ? outputPath 
        : outputPath + formatInfo.extension;
      
      await imageGenerator.generateImage(graph, finalOutputPath, {
        format: options.format as ImageFormat,
        width: parseInt(options.width),
        height: parseInt(options.height),
        quality: parseInt(options.quality),
        transparent: options.transparent || false,
      });
      
      console.log(chalk.green(`✅ ${options.format.toUpperCase()} image saved to: ${finalOutputPath}`));
      
      // Show some stats
      const stats = calculateStats(graph);
      console.log(chalk.dim(`📊 ${stats.totalNodes} executors, ${stats.totalEdges} dependencies`));
      
    } catch (error) {
      spinner.fail("Export failed");
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();