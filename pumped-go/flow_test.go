package pumped

import (
	"context"
	"testing"
)

func TestBasicFlowExecution(t *testing.T) {
	scope := NewScope()
	defer scope.Dispose()

	dbConfig := Provide(func(ctx *ResolveCtx) (string, error) {
		return "localhost:5432", nil
	})

	fetchUser := Flow1(dbConfig, func(execCtx *ExecutionCtx, cfg *Controller[string]) (string, error) {
		dbHost, err := cfg.Get()
		if err != nil {
			return "", err
		}
		return "user-from-" + dbHost, nil
	}, WithFlowTag(FlowName(), "fetchUser"))

	result, execNode, err := Exec(scope, context.Background(), fetchUser)
	if err != nil {
		t.Fatalf("flow execution failed: %v", err)
	}

	if result != "user-from-localhost:5432" {
		t.Errorf("expected 'user-from-localhost:5432', got %q", result)
	}

	if execNode == nil {
		t.Fatal("execution context is nil")
	}

	status, ok := execNode.Get(statusTag)
	if !ok {
		t.Fatal("status tag not set")
	}

	if status != ExecutionStatusSuccess {
		t.Errorf("expected status Success, got %v", status)
	}

	tree := scope.GetExecutionTree()
	roots := tree.GetRoots()
	if len(roots) != 1 {
		t.Errorf("expected 1 root execution, got %d", len(roots))
	}
}

func TestSubFlowExecution(t *testing.T) {
	scope := NewScope()
	defer scope.Dispose()

	step1 := Flow1(Provide(func(ctx *ResolveCtx) (int, error) {
		return 42, nil
	}), func(execCtx *ExecutionCtx, input *Controller[int]) (int, error) {
		val, err := input.Get()
		if err != nil {
			return 0, err
		}
		return val * 2, nil
	}, WithFlowTag(FlowName(), "step1"))

	step2 := Flow1(Provide(func(ctx *ResolveCtx) (int, error) {
		return 10, nil
	}), func(execCtx *ExecutionCtx, input *Controller[int]) (int, error) {
		result1, _, err := Exec1(execCtx, step1)
		if err != nil {
			return 0, err
		}

		val, err := input.Get()
		if err != nil {
			return 0, err
		}

		return result1 + val, nil
	}, WithFlowTag(FlowName(), "step2"))

	result, _, err := Exec(scope, context.Background(), step2)
	if err != nil {
		t.Fatalf("flow execution failed: %v", err)
	}

	expected := (42 * 2) + 10
	if result != expected {
		t.Errorf("expected %d, got %d", expected, result)
	}

	tree := scope.GetExecutionTree()
	roots := tree.GetRoots()
	if len(roots) != 1 {
		t.Errorf("expected 1 root execution, got %d", len(roots))
	}

	rootNode := roots[0]
	children := tree.GetChildren(rootNode.ID)
	if len(children) != 1 {
		t.Errorf("expected 1 child execution, got %d", len(children))
	}
}

func TestFlowPanicRecovery(t *testing.T) {
	scope := NewScope()
	defer scope.Dispose()

	panicFlow := Flow1(Provide(func(ctx *ResolveCtx) (int, error) {
		return 1, nil
	}), func(execCtx *ExecutionCtx, input *Controller[int]) (string, error) {
		panic("test panic")
	}, WithFlowTag(FlowName(), "panicFlow"))

	_, execNode, err := Exec(scope, context.Background(), panicFlow)
	if err == nil {
		t.Fatal("expected error from panic, got nil")
	}

	if execNode == nil {
		t.Fatal("execution context is nil")
	}

	status, ok := execNode.Get(statusTag)
	if !ok {
		t.Fatal("status tag not set")
	}

	if status != ExecutionStatusFailed {
		t.Errorf("expected status Failed, got %v", status)
	}

	stack, ok := execNode.Get(panicStackTag)
	if !ok {
		t.Error("panic stack not captured")
	}
	if len(stack.([]byte)) == 0 {
		t.Error("panic stack is empty")
	}
}

func TestExecutionContextTagLookup(t *testing.T) {
	scope := NewScope()
	defer scope.Dispose()

	customTag := NewTag[string]("custom.tag")
	scope.SetTag(customTag, "scope-value")

	parentFlow := Flow1(Provide(func(ctx *ResolveCtx) (int, error) {
		return 1, nil
	}), func(execCtx *ExecutionCtx, input *Controller[int]) (string, error) {
		execCtx.Set(customTag, "parent-value")

		childFlow := Flow1(Provide(func(ctx *ResolveCtx) (int, error) {
			return 2, nil
		}), func(childCtx *ExecutionCtx, input *Controller[int]) (string, error) {
			val, ok := childCtx.Get(customTag)
			if ok {
				t.Error("child should not have its own value")
			}

			val, ok = childCtx.GetFromParent(customTag)
			if !ok {
				t.Fatal("child should find parent value")
			}
			if val != "parent-value" {
				t.Errorf("expected 'parent-value', got %q", val)
			}

			val, ok = childCtx.Lookup(customTag)
			if !ok {
				t.Fatal("lookup should find parent value")
			}
			if val != "parent-value" {
				t.Errorf("lookup expected 'parent-value', got %q", val)
			}

			return "ok", nil
		})

		_, _, err := Exec1(execCtx, childFlow)
		return "ok", err
	})

	_, _, err := Exec(scope, context.Background(), parentFlow)
	if err != nil {
		t.Fatalf("flow execution failed: %v", err)
	}
}
