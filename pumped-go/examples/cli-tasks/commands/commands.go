package commands

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/pumped-fn/pumped-go/examples/cli-tasks/graph"

	pumped "github.com/pumped-fn/pumped-go"
)

func Add(scope *pumped.Scope, g *graph.Graph, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("task title required")
	}

	title := strings.Join(args, " ")

	taskSvc, err := pumped.Resolve(scope, g.TaskService)
	if err != nil {
		return err
	}

	task, err := taskSvc.Add(title)
	if err != nil {
		return err
	}

	fmt.Printf("Added task #%d: %s\n", task.ID, task.Title)
	return nil
}

func List(scope *pumped.Scope, g *graph.Graph, args []string) error {
	filter := "all"
	if len(args) > 0 {
		filter = args[0]
	}

	taskSvc, err := pumped.Resolve(scope, g.TaskService)
	if err != nil {
		return err
	}

	tasks, err := taskSvc.List(filter)
	if err != nil {
		return err
	}

	if len(tasks) == 0 {
		fmt.Println("No tasks found")
		return nil
	}

	fmt.Printf("Tasks (%s):\n", filter)
	for _, task := range tasks {
		status := " "
		if task.Completed {
			status = "✓"
		}
		fmt.Printf("  [%s] #%d: %s\n", status, task.ID, task.Title)
	}
	return nil
}

func Complete(scope *pumped.Scope, g *graph.Graph, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("task ID required")
	}

	id, err := strconv.Atoi(args[0])
	if err != nil {
		return fmt.Errorf("invalid task ID: %s", args[0])
	}

	taskSvc, err := pumped.Resolve(scope, g.TaskService)
	if err != nil {
		return err
	}

	task, err := taskSvc.Complete(id)
	if err != nil {
		return err
	}

	fmt.Printf("Completed task #%d: %s\n", task.ID, task.Title)
	return nil
}

func Stats(scope *pumped.Scope, g *graph.Graph, args []string) error {
	statsSvc, err := pumped.Resolve(scope, g.StatsService)
	if err != nil {
		return err
	}

	stats, err := statsSvc.GetStats()
	if err != nil {
		return err
	}

	fmt.Println("Task Statistics:")
	fmt.Printf("  Total:     %d\n", stats.Total)
	fmt.Printf("  Pending:   %d\n", stats.Pending)
	fmt.Printf("  Completed: %d\n", stats.Completed)
	return nil
}
