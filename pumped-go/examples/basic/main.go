package main

import (
	"fmt"

	pumped "github.com/pumped-fn/pumped-go"
	"github.com/pumped-fn/pumped-go/extensions"
)

func main() {
	fmt.Println("=== Pumped Go Example ===")

	// Create scope with logging extension
	scope := pumped.NewScope(
		pumped.WithExtension(extensions.NewLoggingExtension()),
	)
	defer scope.Dispose()

	// Define executors
	counter := pumped.Provide(func(ctx *pumped.ResolveCtx) (int, error) {
		fmt.Println("  -> Factory: Creating counter")
		return 0, nil
	})

	doubled := pumped.Derive1(
		counter.Reactive(),
		func(ctx *pumped.ResolveCtx, counterCtrl *pumped.Controller[int]) (int, error) {
			fmt.Println("  -> Factory: Doubling")
			count, err := counterCtrl.Get()
			if err != nil {
				return 0, err
			}
			return count * 2, nil
		},
	)

	tripled := pumped.Derive1(
		counter.Reactive(),
		func(ctx *pumped.ResolveCtx, counterCtrl *pumped.Controller[int]) (int, error) {
			fmt.Println("  -> Factory: Tripling")
			count, err := counterCtrl.Get()
			if err != nil {
				return 0, err
			}
			return count * 3, nil
		},
	)

	// Create a button that can update the counter
	button := pumped.Derive1(
		counter,
		func(ctx *pumped.ResolveCtx, counterCtrl *pumped.Controller[int]) (*Button, error) {
			fmt.Println("  -> Factory: Creating button")
			return &Button{
				onClick: func() error {
					current, err := counterCtrl.Get()
					if err != nil {
						return err
					}
					fmt.Printf("  -> Button clicked! Updating %d -> %d\n", current, current+1)
					return counterCtrl.Update(current + 1)
				},
			}, nil
		},
	)

	// Initial resolution
	fmt.Println("=== Initial Resolution ===")
	doubledAcc := pumped.Accessor(scope, doubled)
	tripledAcc := pumped.Accessor(scope, tripled)
	buttonAcc := pumped.Accessor(scope, button)

	val1, _ := doubledAcc.Get()
	val2, _ := tripledAcc.Get()
	btn, _ := buttonAcc.Get()

	fmt.Printf("Doubled: %d, Tripled: %d\n", val1, val2)
	fmt.Println()

	// Click button to update counter
	fmt.Println("=== Click Button (triggers reactivity) ===")
	btn.onClick()

	// Reactive executors are invalidated
	val1, _ = doubledAcc.Get()
	val2, _ = tripledAcc.Get()
	fmt.Printf("Doubled: %d, Tripled: %d\n", val1, val2)
	fmt.Println()

	// Click again
	fmt.Println("=== Click Again ===")
	btn.onClick()

	val1, _ = doubledAcc.Get()
	val2, _ = tripledAcc.Get()
	fmt.Printf("Doubled: %d, Tripled: %d\n", val1, val2)
	fmt.Println()

	// Demo tags
	fmt.Println("=== Tags Demo ===")
	versionTag := pumped.NewTag[string]("version")
	versionTag.Set(counter, "1.0.0")

	if version, ok := versionTag.Get(counter); ok {
		fmt.Printf("Counter version: %s\n", version)
	}
}

type Button struct {
	onClick func() error
}
