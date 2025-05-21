import type { DependencyGraph } from './types';

/**
 * Creates a dependency graph to track relationships between components
 * and propagate changes up the component tree
 */
export function createDependencyGraph(): DependencyGraph {
  // Map of node ID to its dependencies and subscribers
  const nodes = new Map<string, {
    dependencies: Set<string>;
    subscribers: Set<string>;
  }>();
  
  return {
    addNode(id: string): void {
      if (!nodes.has(id)) {
        nodes.set(id, {
          dependencies: new Set(),
          subscribers: new Set()
        });
      }
    },
    
    removeNode(id: string): void {
      // Remove this node as a dependency from all its subscribers
      const node = nodes.get(id);
      if (node) {
        // Remove this node from all its dependencies' subscribers
        for (const depId of node.dependencies) {
          const depNode = nodes.get(depId);
          if (depNode) {
            depNode.subscribers.delete(id);
          }
        }
        
        // Remove this node from all its subscribers' dependencies
        for (const subId of node.subscribers) {
          const subNode = nodes.get(subId);
          if (subNode) {
            subNode.dependencies.delete(id);
          }
        }
      }
      
      // Remove the node itself
      nodes.delete(id);
    },
    
    addDependency(fromId: string, toId: string): void {
      // Ensure both nodes exist
      this.addNode(fromId);
      this.addNode(toId);
      
      // Add dependency relationship
      const fromNode = nodes.get(fromId)!;
      const toNode = nodes.get(toId)!;
      
      fromNode.dependencies.add(toId);
      toNode.subscribers.add(fromId);
    },
    
    removeDependency(fromId: string, toId: string): void {
      const fromNode = nodes.get(fromId);
      const toNode = nodes.get(toId);
      
      if (fromNode) {
        fromNode.dependencies.delete(toId);
      }
      
      if (toNode) {
        toNode.subscribers.delete(fromId);
      }
    },
    
    getAffectedNodes(changedNodeId: string): Set<string> {
      const affected = new Set<string>();
      const queue: string[] = [changedNodeId];
      
      // Breadth-first traversal to find all affected nodes
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        affected.add(currentId);
        
        const node = nodes.get(currentId);
        if (node) {
          for (const subscriberId of node.subscribers) {
            if (!affected.has(subscriberId)) {
              queue.push(subscriberId);
            }
          }
        }
      }
      
      // Remove the original changed node from the result
      affected.delete(changedNodeId);
      
      return affected;
    }
  };
}

