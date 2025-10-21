package main

import (
	"fmt"
	"os"

	"github.com/pumped-fn/pumped-go/examples/cli-tasks/commands"
	"github.com/pumped-fn/pumped-go/examples/cli-tasks/graph"

	pumped "github.com/pumped-fn/pumped-go"
	"github.com/pumped-fn/pumped-go/extensions"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	scope := pumped.NewScope(
		pumped.WithExtension(extensions.NewLoggingExtension()),
	)
	defer scope.Dispose()

	g := graph.Define()

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "add":
		if err := commands.Add(scope, g, args); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	case "list":
		if err := commands.List(scope, g, args); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	case "complete":
		if err := commands.Complete(scope, g, args); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	case "stats":
		if err := commands.Stats(scope, g, args); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Task Manager CLI")
	fmt.Println("")
	fmt.Println("Usage:")
	fmt.Println("  cli-tasks add <title>      - Add a new task")
	fmt.Println("  cli-tasks list [filter]    - List tasks (all/pending/completed)")
	fmt.Println("  cli-tasks complete <id>    - Mark task as completed")
	fmt.Println("  cli-tasks stats            - Show statistics")
}
