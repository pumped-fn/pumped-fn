package main

import (
	"context"
	"fmt"
	"log"

	pumped "github.com/pumped-fn/pumped-go"
)

type DB struct {
	host string
}

func (db *DB) QueryUser(id string) (string, error) {
	return fmt.Sprintf("User-%s", id), nil
}

func (db *DB) QueryOrders(userID string) ([]string, error) {
	return []string{"Order-1", "Order-2"}, nil
}

type Config struct {
	dbHost string
	apiKey string
}

func main() {
	scope := pumped.NewScope()
	defer scope.Dispose()

	config := pumped.Provide(func(ctx *pumped.ResolveCtx) (*Config, error) {
		return &Config{
			dbHost: "localhost:5432",
			apiKey: "secret-key",
		}, nil
	})

	database := pumped.Derive1(config, func(ctx *pumped.ResolveCtx, cfg *pumped.Controller[*Config]) (*DB, error) {
		c, err := cfg.Get()
		if err != nil {
			return nil, err
		}
		return &DB{host: c.dbHost}, nil
	})

	fetchUserFlow := pumped.Flow1(database,
		func(execCtx *pumped.ExecutionCtx, db *pumped.Controller[*DB]) (string, error) {
			d, err := db.Get()
			if err != nil {
				return "", err
			}

			userID := "123"
			execCtx.Set(pumped.Input(), userID)

			user, err := d.QueryUser(userID)
			if err != nil {
				return "", err
			}

			log.Printf("[%s] Fetched user: %s", execCtx.Context().Value("requestID"), user)
			return user, nil
		},
		pumped.WithFlowTag(pumped.FlowName(), "fetchUser"),
	)

	fetchOrdersFlow := pumped.Flow1(database,
		func(execCtx *pumped.ExecutionCtx, db *pumped.Controller[*DB]) ([]string, error) {
			d, err := db.Get()
			if err != nil {
				return nil, err
			}

			userIDRaw, ok := execCtx.GetFromParent(pumped.Input())
			if !ok {
				return nil, fmt.Errorf("user ID not found in parent context")
			}
			userID := userIDRaw.(string)

			orders, err := d.QueryOrders(userID)
			if err != nil {
				return nil, err
			}

			log.Printf("[%s] Fetched %d orders for user %s",
				execCtx.Context().Value("requestID"), len(orders), userID)
			return orders, nil
		},
		pumped.WithFlowTag(pumped.FlowName(), "fetchOrders"),
	)

	processOrderFlow := pumped.Flow1(database,
		func(execCtx *pumped.ExecutionCtx, db *pumped.Controller[*DB]) (string, error) {
			user, userCtx, err := pumped.Exec1(execCtx, fetchUserFlow)
			if err != nil {
				return "", fmt.Errorf("fetch user failed: %w", err)
			}

			orders, _, err := pumped.Exec1(userCtx, fetchOrdersFlow)
			if err != nil {
				return "", fmt.Errorf("fetch orders failed: %w", err)
			}

			result := fmt.Sprintf("Processed %d orders for %s", len(orders), user)
			log.Printf("[%s] %s", execCtx.Context().Value("requestID"), result)

			return result, nil
		},
		pumped.WithFlowTag(pumped.FlowName(), "processOrder"),
	)

	ctx := context.WithValue(context.Background(), "requestID", "req-001")
	result, execNode, err := pumped.Exec(scope, ctx, processOrderFlow)
	if err != nil {
		log.Fatalf("Flow execution failed: %v", err)
	}

	fmt.Printf("\nResult: %s\n", result)

	if name, ok := execNode.Get(pumped.FlowName()); ok {
		fmt.Printf("Flow Name: %s\n", name)
	}

	tree := scope.GetExecutionTree()
	roots := tree.GetRoots()
	fmt.Printf("\nExecution tree:\n")
	for _, root := range roots {
		printTree(tree, root, 0)
	}
}

func printTree(tree *pumped.ExecutionTree, node *pumped.ExecutionNode, depth int) {
	indent := ""
	for i := 0; i < depth; i++ {
		indent += "  "
	}

	flowName := "unknown"
	if name, ok := node.GetTag(pumped.FlowName()); ok {
		flowName = name.(string)
	}

	status := "unknown"
	if s, ok := node.GetTag(pumped.Status()); ok {
		switch s.(pumped.ExecutionStatus) {
		case pumped.ExecutionStatusSuccess:
			status = "success"
		case pumped.ExecutionStatusFailed:
			status = "failed"
		case pumped.ExecutionStatusRunning:
			status = "running"
		}
	}

	fmt.Printf("%s- %s [%s] (ID: %s)\n", indent, flowName, status, node.ID)

	children := tree.GetChildren(node.ID)
	for _, child := range children {
		printTree(tree, child, depth+1)
	}
}
