import { describe, test, expect } from "vitest";
import { flow, FlowExecutionContext } from "../src/flow";
import type { Flow } from "../src/types";
import { custom } from "../src/ssch";
import { accessor } from "../src/accessor";

namespace ExecutionTree {
  export interface Node {
    id: string;
    name: string;
    type: "direct" | "parallel" | "race";
    startTime: number;
    endTime?: number;
    duration?: number;
    status: "running" | "success" | "error";
    error?: string;
    depth: number;
    parent?: string;
    children: Node[];
    isParallel: boolean;
  }

  export interface Tree {
    root: Node;
    allNodes: Map<string, Node>;
  }
}

function createExecutionTracker(): {
  plugin: Flow.Plugin;
  getTree: () => ExecutionTree.Tree | null;
  visualize: () => string;
} {
  let tree: ExecutionTree.Tree | null = null;
  const nodeStack: string[] = [];
  let nodeCounter = 0;

  const treeAccessor = accessor<ExecutionTree.Tree>(
    "execution.tree",
    custom<ExecutionTree.Tree>()
  );

  function createNode(
    name: string,
    type: ExecutionTree.Node["type"],
    depth: number,
    isParallel: boolean
  ): ExecutionTree.Node {
    return {
      id: `node-${++nodeCounter}`,
      name,
      type,
      startTime: Date.now(),
      status: "running",
      depth,
      parent: nodeStack[nodeStack.length - 1],
      children: [],
      isParallel,
    };
  }

  function visualizeNode(node: ExecutionTree.Node, indent = ""): string[] {
    const prefix = indent + (node.depth > 0 ? "├── " : "");
    const typeIcon =
      node.type === "parallel" ? "⚡" : node.type === "race" ? "🏁" : "→";
    const statusIcon =
      node.status === "success" ? "✅" : node.status === "error" ? "❌" : "⏳";
    const duration = node.duration ? ` (${node.duration}ms)` : "";
    const error = node.error ? ` [${node.error}]` : "";

    const lines = [
      `${prefix}${typeIcon} ${node.name} ${statusIcon}${duration}${error}`,
    ];

    for (const child of node.children) {
      lines.push(
        ...visualizeNode(child, indent + (node.depth > 0 ? "│   " : ""))
      );
    }

    return lines;
  }

  const plugin = flow.plugin({
    name: "execution-tracker",

    init(_pod, context) {
      tree = {
        root: createNode("root", "direct", 0, false),
        allNodes: new Map(),
      };
      tree.allNodes.set(tree.root.id, tree.root);
      treeAccessor.set(context, tree);
    },

    async wrap(context, next) {
      const currentTree = treeAccessor.find(context);
      if (!currentTree) return next();

      let flowName = FlowExecutionContext.flowName.find(context);
      const depth = FlowExecutionContext.depth.find(context) || 0;
      const isParallel = FlowExecutionContext.isParallel.find(context) || false;

      const nodeType: ExecutionTree.Node["type"] = isParallel
        ? "parallel"
        : "direct";
      const node = createNode(
        flowName || "unknown",
        nodeType,
        depth,
        isParallel
      );

      currentTree.allNodes.set(node.id, node);

      if (nodeStack.length > 0) {
        const parentId = nodeStack[nodeStack.length - 1];
        const parent = currentTree.allNodes.get(parentId);
        if (parent) {
          parent.children.push(node);
          node.parent = parentId;
        }
      } else {
        currentTree.root.children.push(node);
      }

      nodeStack.push(node.id);

      try {
        const result = await next();

        flowName = FlowExecutionContext.flowName.find(context);
        if (flowName && node.name === "unknown") {
          node.name = flowName;
        }

        node.endTime = Date.now();
        node.duration = node.endTime - node.startTime;
        node.status = "success";
        return result;
      } catch (error) {
        node.endTime = Date.now();
        node.duration = node.endTime - node.startTime;
        node.status = "error";
        node.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        nodeStack.pop();
      }
    },
  });

  return {
    plugin,
    getTree: () => tree,
    visualize: () => {
      if (!tree) return "No execution tree available";
      return visualizeNode(tree.root).join("\n");
    },
  };
}

describe("Flow Plugin Execution Tree Demonstration", () => {
  test("demonstrates comprehensive execution patterns with tree visualization", async () => {
    const tracker = createExecutionTracker();

    const basicFlow = flow.define({
      name: "basic-task",
      input: custom<{ value: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ message: string }>(),
    });

    const parallelFlow = flow.define({
      name: "parallel-processor",
      input: custom<{ items: number[] }>(),
      success: custom<{ results: number[] }>(),
      error: custom<{ message: string }>(),
    });

    const errorFlow = flow.define({
      name: "error-prone",
      input: custom<{ shouldFail: boolean }>(),
      success: custom<{ success: true }>(),
      error: custom<{ message: string }>(),
    });

    const exceptionFlow = flow.define({
      name: "exception-thrower",
      input: custom<{ shouldThrow: boolean }>(),
      success: custom<{ success: true }>(),
      error: custom<{ message: string }>(),
    });

    const masterFlow = flow.define({
      name: "master-orchestrator",
      input: custom<{ data: number[] }>(),
      success: custom<{
        processed: number[];
        parallel: number[];
        errors: string[];
      }>(),
      error: custom<{ message: string }>(),
    });

    const basicImpl = basicFlow.handler(async (ctx, input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return ctx.ok({ result: input.value * 2 });
    });

    const parallelImpl = parallelFlow.handler(async (ctx, input) => {
      const results = await ctx.executeParallel(
        input.items.map((item) => [basicImpl, { value: item }] as const)
      );

      return ctx.ok({
        results: results.map((r: any) => (r.type === "ok" ? r.data.result : 0)),
      });
    });

    const errorImpl = errorFlow.handler(async (ctx, input) => {
      if (input.shouldFail) {
        return ctx.ko({ message: "Intentional failure" });
      }
      return ctx.ok({ success: true });
    });

    const exceptionImpl = exceptionFlow.handler(async (ctx, input) => {
      if (input.shouldThrow) {
        throw new Error("Uncaught exception from flow");
      }
      return ctx.ok({ success: true });
    });

    const masterImpl = masterFlow.handler(async (ctx, input) => {
      const processed: number[] = [];
      const errors: string[] = [];

      for (const value of input.data.slice(0, 2)) {
        try {
          const result = await ctx.execute(basicImpl, { value });
          if (result.type === "ok") {
            processed.push(result.data.result);
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      const parallelResult = await ctx.execute(parallelImpl, {
        items: input.data.slice(2, 5),
      });

      let parallel: number[] = [];
      if (parallelResult.type === "ok") {
        parallel = parallelResult.data.results;
      }

      const errorResult = await ctx.execute(errorImpl, { shouldFail: true });
      if (errorResult.type === "ko") {
        errors.push("Caught error flow failure");
      }

      const successResult = await ctx.execute(errorImpl, { shouldFail: false });
      if (successResult.type === "ko") {
        errors.push("Unexpected error from success flow");
      }

      try {
        await ctx.execute(exceptionImpl, { shouldThrow: true });
      } catch (error) {
        errors.push("Caught uncaught exception");
      }

      try {
        await ctx.execute(exceptionImpl, { shouldThrow: false });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }

      return ctx.ok({ processed, parallel, errors });
    });

    const result = await flow.execute(
      masterImpl,
      { data: [1, 2, 3, 4, 5] },
      { plugins: [tracker.plugin] }
    );

    expect(result.type).toBe("ok");
    if (result.type === "ok") {
      expect(result.data.processed).toEqual([2, 4]);
      expect(result.data.parallel).toEqual([6, 8, 10]);
      expect(result.data.errors).toEqual([
        "Caught error flow failure",
        "Caught uncaught exception",
      ]);
    }

    const tree = tracker.getTree();
    expect(tree).toBeTruthy();
    expect(tree!.allNodes.size).toBeGreaterThan(1);

    const visualization = tracker.visualize();
    expect(visualization).toContain("master-orchestrator");
    expect(visualization).toContain("basic-task");
    expect(visualization).toContain("parallel-processor");
    expect(visualization).toContain("error-prone");
    expect(visualization).toContain("exception-thrower");
    expect(visualization).toContain("✅");

    console.log("\n🌳 Execution Tree:");
    console.log(visualization);
    console.log(`\n📊 Total nodes: ${tree!.allNodes.size}`);
    console.log(
      `📈 Max depth: ${Math.max(
        ...Array.from(tree!.allNodes.values()).map((n) => n.depth)
      )}`
    );

    const successCount = Array.from(tree!.allNodes.values()).filter(
      (n) => n.status === "success"
    ).length;
    const errorCount = Array.from(tree!.allNodes.values()).filter(
      (n) => n.status === "error"
    ).length;
    console.log(`✅ Successful executions: ${successCount}`);
    console.log(`❌ Failed executions: ${errorCount}`);
  });
});
