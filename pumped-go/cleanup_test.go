package pumped

import (
	"errors"
	"testing"
)

func TestCleanup_Basic(t *testing.T) {
	scope := NewScope()

	cleaned := []string{}

	exec := Provide(func(ctx *ResolveCtx) (string, error) {
		ctx.OnCleanup(func() error {
			cleaned = append(cleaned, "resource")
			return nil
		})
		return "value", nil
	})

	_, err := Resolve(scope, exec)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	scope.Dispose()

	if len(cleaned) != 1 || cleaned[0] != "resource" {
		t.Errorf("expected cleanup to be called once, got %v", cleaned)
	}
}

func TestCleanup_LIFOOrder(t *testing.T) {
	scope := NewScope()

	cleaned := []string{}

	exec := Provide(func(ctx *ResolveCtx) (string, error) {
		ctx.OnCleanup(func() error {
			cleaned = append(cleaned, "first")
			return nil
		})
		ctx.OnCleanup(func() error {
			cleaned = append(cleaned, "second")
			return nil
		})
		ctx.OnCleanup(func() error {
			cleaned = append(cleaned, "third")
			return nil
		})
		return "value", nil
	})

	_, err := Resolve(scope, exec)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	scope.Dispose()

	expected := []string{"third", "second", "first"}
	if len(cleaned) != len(expected) {
		t.Fatalf("expected %d cleanups, got %d", len(expected), len(cleaned))
	}

	for i, v := range expected {
		if cleaned[i] != v {
			t.Errorf("at index %d: expected %s, got %s", i, v, cleaned[i])
		}
	}
}

func TestCleanup_ReactiveReplacement(t *testing.T) {
	scope := NewScope()

	cleaned := []string{}

	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 0, nil
	})

	derived := Derive1(
		counter.Reactive(),
		func(ctx *ResolveCtx, counterCtrl *Controller[int]) (string, error) {
			count, _ := counterCtrl.Get()
			value := count
			ctx.OnCleanup(func() error {
				cleaned = append(cleaned, "derived-"+string(rune('0'+value)))
				return nil
			})
			return "value", nil
		},
	)

	_, err := Resolve(scope, derived)
	if err != nil {
		t.Fatalf("expected no error on first resolve: %v", err)
	}

	if len(cleaned) != 0 {
		t.Errorf("expected no cleanup yet, got %v", cleaned)
	}

	counterCtrl := Accessor(scope, counter)
	counterCtrl.Update(1)

	if len(cleaned) != 1 {
		t.Fatalf("expected 1 cleanup after update, got %d", len(cleaned))
	}

	if cleaned[0] != "derived-0" {
		t.Errorf("expected 'derived-0', got %s", cleaned[0])
	}

	_, err = Resolve(scope, derived)
	if err != nil {
		t.Fatalf("expected no error on re-resolve: %v", err)
	}

	scope.Dispose()

	if len(cleaned) != 2 {
		t.Fatalf("expected 2 cleanups total, got %d", len(cleaned))
	}

	if cleaned[1] != "derived-1" {
		t.Errorf("expected second cleanup 'derived-1', got %s", cleaned[1])
	}
}

func TestCleanup_Tags(t *testing.T) {
	scope := NewScope()

	cleanupPolicyTag := NewTag[string]("cleanup.policy")
	resourceTypeTag := NewTag[string]("resource.type")

	executorsSeen := []AnyExecutor{}

	testExt := &testCleanupExtension{
		handler: func(err *CleanupError) bool {
			executorsSeen = append(executorsSeen, err.ExecutorID)
			return true
		},
	}

	scope.UseExtension(testExt)

	exec := Provide(func(ctx *ResolveCtx) (string, error) {
		ctx.OnCleanup(func() error {
			return errors.New("cleanup failed")
		})
		return "value", nil
	}, WithTag(cleanupPolicyTag, "critical"), WithTag(resourceTypeTag, "database"))

	Resolve(scope, exec)
	scope.Dispose()

	if len(executorsSeen) != 1 {
		t.Fatalf("expected 1 cleanup error, got %d", len(executorsSeen))
	}

	executor := executorsSeen[0]

	policy, ok := cleanupPolicyTag.Get(executor)
	if !ok || policy != "critical" {
		t.Errorf("expected cleanup.policy=critical, got %s (ok=%v)", policy, ok)
	}

	resource, ok := resourceTypeTag.Get(executor)
	if !ok || resource != "database" {
		t.Errorf("expected resource.type=database, got %s (ok=%v)", resource, ok)
	}
}

func TestCleanup_ErrorContext(t *testing.T) {
	scope := NewScope()

	contexts := []string{}

	testExt := &testCleanupExtension{
		handler: func(err *CleanupError) bool {
			contexts = append(contexts, err.Context)
			return true
		},
	}

	scope.UseExtension(testExt)

	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 0, nil
	})

	derived := Derive1(
		counter.Reactive(),
		func(ctx *ResolveCtx, counterCtrl *Controller[int]) (string, error) {
			ctx.OnCleanup(func() error {
				return errors.New("cleanup failed")
			})
			return "value", nil
		},
	)

	Resolve(scope, derived)

	counterCtrl := Accessor(scope, counter)
	counterCtrl.Update(1)

	if len(contexts) != 1 {
		t.Fatalf("expected 1 context after reactive update, got %d", len(contexts))
	}

	if contexts[0] != "reactive" {
		t.Errorf("expected context=reactive, got %s", contexts[0])
	}

	Resolve(scope, derived)

	scope.Dispose()

	if len(contexts) != 2 {
		t.Fatalf("expected 2 contexts total, got %d", len(contexts))
	}

	if contexts[1] != "dispose" {
		t.Errorf("expected second context=dispose, got %s", contexts[1])
	}
}

func TestCleanup_MultipleExecutors(t *testing.T) {
	scope := NewScope()

	cleaned := []string{}

	exec1 := Provide(func(ctx *ResolveCtx) (string, error) {
		ctx.OnCleanup(func() error {
			cleaned = append(cleaned, "exec1")
			return nil
		})
		return "value1", nil
	})

	exec2 := Provide(func(ctx *ResolveCtx) (string, error) {
		ctx.OnCleanup(func() error {
			cleaned = append(cleaned, "exec2")
			return nil
		})
		return "value2", nil
	})

	Resolve(scope, exec1)
	Resolve(scope, exec2)

	scope.Dispose()

	if len(cleaned) != 2 {
		t.Fatalf("expected 2 cleanups, got %d", len(cleaned))
	}

	if cleaned[0] != "exec2" {
		t.Errorf("expected exec2 first (LIFO), got %s", cleaned[0])
	}
	if cleaned[1] != "exec1" {
		t.Errorf("expected exec1 second, got %s", cleaned[1])
	}
}

type testCleanupExtension struct {
	BaseExtension
	handler func(err *CleanupError) bool
}

func (e *testCleanupExtension) Name() string {
	return "test-cleanup-extension"
}

func (e *testCleanupExtension) OnCleanupError(err *CleanupError) bool {
	if e.handler != nil {
		return e.handler(err)
	}
	return false
}
