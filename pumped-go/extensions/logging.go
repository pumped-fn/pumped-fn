package extensions

import (
	"context"
	"fmt"
	"time"

	pumped "github.com/pumped-fn/pumped-go"
)

// LoggingExtension logs all operations
type LoggingExtension struct {
	pumped.BaseExtension
}

// NewLoggingExtension creates a new logging extension
func NewLoggingExtension() *LoggingExtension {
	return &LoggingExtension{
		BaseExtension: pumped.NewBaseExtension("logging"),
	}
}

func (e *LoggingExtension) Wrap(ctx context.Context, next func() (any, error), op *pumped.Operation) (any, error) {
	start := time.Now()
	fmt.Printf("[%s] %s starting\n", e.Name(), op.Kind)

	result, err := next()

	duration := time.Since(start)
	if err != nil {
		fmt.Printf("[%s] %s failed after %v: %v\n", e.Name(), op.Kind, duration, err)
	} else {
		fmt.Printf("[%s] %s completed in %v\n", e.Name(), op.Kind, duration)
	}

	return result, err
}
