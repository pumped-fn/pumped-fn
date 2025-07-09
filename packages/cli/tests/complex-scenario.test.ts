import { describe, it, expect } from "vitest";
import { ASTAnalyzer } from "../src/ast-analyzer.js";
import { MermaidGenerator } from "../src/mermaid-generator.js";
import { TUIVisualizer } from "../src/tui-visualizer.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Complex Scenario Analysis", () => {
  const createComplexApp = () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pumped-complex-test-"));
    
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
    
    // Create complex application files
    const files = {
      "config.ts": `
        import { provide, meta, custom } from "@pumped-fn/core-next";
        
        const name = meta("name", custom<string>());
        
        export const dbConfig = provide(
          () => ({ host: "localhost", port: 5432 }),
          name("dbConfig")
        );
        
        export const apiConfig = provide(
          () => ({ baseUrl: "/api", timeout: 5000 }),
          name("apiConfig")
        );
        
        export const appSettings = provide(
          () => ({ debug: true, version: "1.0.0" }),
          name("appSettings")
        );
      `,
      
      "services.ts": `
        import { derive, meta, custom } from "@pumped-fn/core-next";
        import { dbConfig, apiConfig, appSettings } from "./config.js";
        
        const name = meta("name", custom<string>());
        
        export const database = derive(
          dbConfig.reactive,
          (config) => ({ connect: () => \`postgresql://\${config.host}:\${config.port}\` }),
          name("database")
        );
        
        export const httpClient = derive(
          [apiConfig.reactive, appSettings.reactive],
          ([api, settings]) => ({
            get: (url: string) => fetch(\`\${api.baseUrl}\${url}\`),
            timeout: api.timeout,
            debug: settings.debug
          }),
          name("httpClient")
        );
        
        export const logger = derive(
          appSettings.reactive,
          (settings) => ({
            log: (msg: string) => settings.debug && console.log(msg),
            level: settings.debug ? "debug" : "info"
          }),
          name("logger")
        );
      `,
      
      "repositories.ts": `
        import { derive, meta, custom } from "@pumped-fn/core-next";
        import { database, logger } from "./services.js";
        
        const name = meta("name", custom<string>());
        
        export const userRepository = derive(
          [database.static, logger.static],
          ([db, loggerCtl]) => ({
            findById: (id: string) => {
              loggerCtl.log(\`Finding user \${id}\`);
              return db.query(\`SELECT * FROM users WHERE id = $1\`, [id]);
            }
          }),
          name("userRepository")
        );
        
        export const orderRepository = derive(
          [database.static, logger.static],
          ([db, loggerCtl]) => ({
            findByUser: (userId: string) => {
              loggerCtl.log(\`Finding orders for user \${userId}\`);
              return db.query(\`SELECT * FROM orders WHERE user_id = $1\`, [userId]);
            }
          }),
          name("orderRepository")
        );
      `,
      
      "business-logic.ts": `
        import { derive, meta, custom } from "@pumped-fn/core-next";
        import { userRepository, orderRepository } from "./repositories.js";
        import { httpClient, logger } from "./services.js";
        
        const name = meta("name", custom<string>());
        
        export const userService = derive(
          [userRepository.static, httpClient.static, logger.static],
          ([userRepo, client, loggerCtl]) => ({
            getUser: async (id: string) => {
              loggerCtl.log(\`Getting user \${id}\`);
              const user = await userRepo.findById(id);
              return user;
            },
            
            syncUserData: async (id: string) => {
              const response = await client.get(\`/users/\${id}/sync\`);
              return response.json();
            }
          }),
          name("userService")
        );
        
        export const orderService = derive(
          [orderRepository.static, userService.static, logger.static],
          ([orderRepo, userSvc, loggerCtl]) => ({
            getUserOrders: async (userId: string) => {
              loggerCtl.log(\`Getting orders for user \${userId}\`);
              
              // Ensure user exists first
              const user = await userSvc.getUser(userId);
              if (!user) throw new Error("User not found");
              
              return orderRepo.findByUser(userId);
            }
          }),
          name("orderService")
        );
        
        export const reportingService = derive(
          [userService.static, orderService.static, httpClient.static],
          ([userSvc, orderSvc, client]) => ({
            generateUserReport: async (userId: string) => {
              const [user, orders] = await Promise.all([
                userSvc.getUser(userId),
                orderSvc.getUserOrders(userId)
              ]);
              
              // Send report to external service
              await client.post("/reports", { user, orders });
              
              return { user, orders, reportDate: new Date() };
            }
          }),
          name("reportingService")
        );
      `,
      
      "controllers.ts": `
        import { derive, meta, custom } from "@pumped-fn/core-next";
        import { userService, orderService, reportingService } from "./business-logic.js";
        import { logger } from "./services.js";
        
        const name = meta("name", custom<string>());
        
        export const userController = derive(
          [userService.static, logger.static],
          ([userSvc, loggerCtl]) => ({
            handleGetUser: async (req: any) => {
              try {
                loggerCtl.log(\`User controller: GET /users/\${req.params.id}\`);
                const user = await userSvc.getUser(req.params.id);
                return { status: 200, data: user };
              } catch (error) {
                loggerCtl.log(\`Error: \${error.message}\`);
                return { status: 404, error: "User not found" };
              }
            }
          }),
          name("userController")
        );
        
        export const orderController = derive(
          [orderService.static, reportingService.static, logger.static],
          ([orderSvc, reportSvc, loggerCtl]) => ({
            handleGetOrders: async (req: any) => {
              loggerCtl.log(\`Order controller: GET /users/\${req.params.userId}/orders\`);
              const orders = await orderSvc.getUserOrders(req.params.userId);
              return { status: 200, data: orders };
            },
            
            handleGenerateReport: async (req: any) => {
              loggerCtl.log(\`Generating report for user \${req.params.userId}\`);
              const report = await reportSvc.generateUserReport(req.params.userId);
              return { status: 200, data: report };
            }
          }),
          name("orderController")
        );
      `,
      
      "app.ts": `
        import { derive, meta, custom } from "@pumped-fn/core-next";
        import { userController, orderController } from "./controllers.js";
        import { logger } from "./services.js";
        import { appSettings } from "./config.js";
        
        const name = meta("name", custom<string>());
        
        export const router = derive(
          [userController.static, orderController.static],
          ([userCtl, orderCtl]) => ({
            routes: {
              "GET /users/:id": userCtl.handleGetUser,
              "GET /users/:userId/orders": orderCtl.handleGetOrders,
              "POST /users/:userId/report": orderCtl.handleGenerateReport,
            }
          }),
          name("router")
        );
        
        export const application = derive(
          [router.static, logger.static, appSettings.reactive],
          ([routerCtl, loggerCtl, settings]) => ({
            start: () => {
              loggerCtl.log(\`Starting application v\${settings.version}\`);
              
              const server = {
                listen: (port: number) => {
                  loggerCtl.log(\`Server listening on port \${port}\`);
                  return { port, routes: Object.keys(routerCtl.routes) };
                }
              };
              
              return server;
            }
          }),
          name("application")
        );
      `
    };
    
    // Create files
    for (const [fileName, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(srcDir, fileName), content);
    }
    
    return tempDir;
  };

  it("should analyze complex multi-file application", () => {
    const tempDir = createComplexApp();
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    // Verify we found all the executors
    expect(graph.nodes.length).toBe(15);
    expect(graph.edges.length).toBeGreaterThan(20);
    
    // Check for specific nodes
    const nodeNames = graph.nodes.map(n => n.metaName || n.name);
    expect(nodeNames).toContain("dbConfig");
    expect(nodeNames).toContain("apiConfig");
    expect(nodeNames).toContain("appSettings");
    expect(nodeNames).toContain("database");
    expect(nodeNames).toContain("httpClient");
    expect(nodeNames).toContain("logger");
    expect(nodeNames).toContain("userRepository");
    expect(nodeNames).toContain("orderRepository");
    expect(nodeNames).toContain("userService");
    expect(nodeNames).toContain("orderService");
    expect(nodeNames).toContain("reportingService");
    expect(nodeNames).toContain("userController");
    expect(nodeNames).toContain("orderController");
    expect(nodeNames).toContain("router");
    expect(nodeNames).toContain("application");
    
    // Check complexity
    const complexity = graph.edges.length / graph.nodes.length;
    expect(complexity).toBeGreaterThan(1.5); // Should be a complex graph
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should generate sophisticated mermaid diagram", () => {
    const tempDir = createComplexApp();
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    const generator = new MermaidGenerator({
      theme: "dark",
      direction: "TD",
      showTypes: true,
      showFiles: false,
    });
    
    const mermaidCode = generator.generate(graph);
    
    // Verify mermaid structure
    expect(mermaidCode).toContain("graph TD");
    expect(mermaidCode).toContain("classDef provide");
    expect(mermaidCode).toContain("classDef derive");
    
    // Should contain our key components
    expect(mermaidCode).toContain('dbConfig["dbConfig (provide)"]');
    expect(mermaidCode).toContain('application("application (derive)")');
    
    // Should contain dependency arrows
    expect(mermaidCode).toContain("dbConfig --> database");
    expect(mermaidCode).toContain("userService --> orderService");
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should detect sophisticated dependency patterns", () => {
    const tempDir = createComplexApp();
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    // Find the application node (should be at the top of dependency chain)
    const appNode = graph.nodes.find(n => n.metaName === "application");
    expect(appNode).toBeDefined();
    
    // Find nodes that depend on multiple other nodes
    const complexNodes = graph.nodes.filter(node => {
      const dependencies = graph.edges.filter(edge => edge.to === node.name);
      return dependencies.length >= 2;
    });
    
    expect(complexNodes.length).toBeGreaterThan(5);
    
    // Check for cross-layer dependencies
    const repositoryNodes = graph.nodes.filter(n => n.metaName?.includes("Repository"));
    const serviceNodes = graph.nodes.filter(n => n.metaName?.includes("Service"));
    const controllerNodes = graph.nodes.filter(n => n.metaName?.includes("Controller"));
    
    expect(repositoryNodes.length).toBe(2);
    expect(serviceNodes.length).toBe(3); // userService, orderService, reportingService
    expect(controllerNodes.length).toBe(2);
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should generate appealing TUI visualization", () => {
    const tempDir = createComplexApp();
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    const visualizer = new TUIVisualizer({
      showFiles: false,
      showTypes: true,
      colorize: false, // For testing
      compact: false,
    });
    
    const output = visualizer.visualize(graph);
    
    // Should contain tree structure
    expect(output).toContain("📊 Dependency Tree");
    expect(output).toContain("├──");
    expect(output).toContain("└──");
    
    // Should show complexity
    expect(output).toContain("Total Executors:");
    expect(output).toContain("Dependencies:");
    
    // Should show node details
    expect(output).toContain("📝 Node Details");
    expect(output).toContain("Type: provide");
    expect(output).toContain("Type: derive");
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should calculate meaningful statistics", () => {
    const tempDir = createComplexApp();
    const analyzer = new ASTAnalyzer(tempDir);
    const graph = analyzer.analyze();
    
    // Calculate statistics manually to verify
    const totalNodes = graph.nodes.length;
    const totalEdges = graph.edges.length;
    const providers = graph.nodes.filter(n => n.type === "provide").length;
    const derivations = graph.nodes.filter(n => n.type === "derive").length;
    
    expect(totalNodes).toBe(15);
    expect(providers).toBe(3); // dbConfig, apiConfig, appSettings
    expect(derivations).toBe(12); // All the derived services
    expect(totalEdges).toBeGreaterThan(20);
    
    // Complexity should be significant
    const complexity = totalEdges / totalNodes;
    expect(complexity).toBeGreaterThan(1.5);
    
    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });
});