package pumped

import (
	"fmt"
	"testing"
)

func TestProvide(t *testing.T) {
	scope := NewScope()

	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 42, nil
	})

	val, err := Resolve(scope, counter)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != 42 {
		t.Errorf("expected 42, got %d", val)
	}
}

func TestDerive1(t *testing.T) {
	scope := NewScope()

	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 5, nil
	})

	doubled := Derive1(
		counter,
		func(ctx *ResolveCtx, counterCtrl *Controller[int]) (int, error) {
			count, err := counterCtrl.Get()
			if err != nil {
				return 0, err
			}
			return count * 2, nil
		},
	)

	val, err := Resolve(scope, doubled)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != 10 {
		t.Errorf("expected 10, got %d", val)
	}
}

func TestReactive(t *testing.T) {
	scope := NewScope()

	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 0, nil
	})

	doubled := Derive1(
		counter.Reactive(),
		func(ctx *ResolveCtx, counterCtrl *Controller[int]) (int, error) {
			count, err := counterCtrl.Get()
			if err != nil {
				return 0, err
			}
			return count * 2, nil
		},
	)

	// Initial resolution
	doubledAcc := Accessor(scope, doubled)
	val, _ := doubledAcc.Get()
	if val != 0 {
		t.Errorf("expected 0, got %d", val)
	}

	// Update counter
	counterAcc := Accessor(scope, counter)
	counterAcc.Update(5)

	// Doubled should be invalidated and re-resolved
	val, _ = doubledAcc.Get()
	if val != 10 {
		t.Errorf("expected 10, got %d", val)
	}
}

func TestController(t *testing.T) {
	scope := NewScope()

	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 0, nil
	})

	ctrl := Accessor(scope, counter)

	// Get
	val, _ := ctrl.Get()
	if val != 0 {
		t.Errorf("expected 0, got %d", val)
	}

	// Update
	ctrl.Update(5)
	val, _ = ctrl.Get()
	if val != 5 {
		t.Errorf("expected 5, got %d", val)
	}

	// IsCached
	if !ctrl.IsCached() {
		t.Error("expected value to be cached")
	}

	// Release
	ctrl.Release()
	if ctrl.IsCached() {
		t.Error("expected value to not be cached after release")
	}
}

func TestTags(t *testing.T) {
	versionTag := NewTag[string]("version")

	counter := Provide(
		func(ctx *ResolveCtx) (int, error) {
			return 0, nil
		},
		WithTag(versionTag, "1.0.0"),
	)

	version, ok := versionTag.Get(counter)
	if !ok {
		t.Fatal("expected version tag to be set")
	}

	if version != "1.0.0" {
		t.Errorf("expected 1.0.0, got %s", version)
	}
}

func TestLazyBasic(t *testing.T) {
	scope := NewScope()

	resolveCount := 0
	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		resolveCount++
		return 42, nil
	})

	derived := Derive1(
		counter.Lazy(),
		func(ctx *ResolveCtx, counterCtrl *Controller[int]) (int, error) {
			if resolveCount != 0 {
				t.Error("lazy dependency should not be resolved yet")
			}
			if counterCtrl.IsCached() {
				t.Error("lazy dependency should not be cached yet")
			}
			val, err := counterCtrl.Get()
			if err != nil {
				return 0, err
			}
			if resolveCount != 1 {
				t.Errorf("expected resolve count to be 1, got %d", resolveCount)
			}
			return val * 2, nil
		},
	)

	val, err := Resolve(scope, derived)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != 84 {
		t.Errorf("expected 84, got %d", val)
	}

	if resolveCount != 1 {
		t.Errorf("expected counter to be resolved once, got %d times", resolveCount)
	}
}

func TestLazyConditionalResolution(t *testing.T) {
	storageTypeTag := NewTag[string]("storage.type")

	scope := NewScope(
		WithScopeTag(storageTypeTag, "memory"),
	)

	memResolveCount := 0
	fileResolveCount := 0

	memStorage := Provide(func(ctx *ResolveCtx) (string, error) {
		memResolveCount++
		return "memory-storage", nil
	})

	fileStorage := Provide(func(ctx *ResolveCtx) (string, error) {
		fileResolveCount++
		return "file-storage", nil
	})

	service := Derive2(
		memStorage.Lazy(),
		fileStorage.Lazy(),
		func(ctx *ResolveCtx, memCtrl *Controller[string], fileCtrl *Controller[string]) (string, error) {
			storageType := GetTagOrDefault(ctx, storageTypeTag, "memory")

			if storageType == "file" {
				storage, err := fileCtrl.Get()
				if err != nil {
					return "", err
				}
				return "service-with-" + storage, nil
			}

			storage, err := memCtrl.Get()
			if err != nil {
				return "", err
			}
			return "service-with-" + storage, nil
		},
	)

	val, err := Resolve(scope, service)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != "service-with-memory-storage" {
		t.Errorf("expected 'service-with-memory-storage', got %s", val)
	}

	if memResolveCount != 1 {
		t.Errorf("expected memory storage to be resolved once, got %d", memResolveCount)
	}

	if fileResolveCount != 0 {
		t.Errorf("expected file storage to not be resolved, got %d", fileResolveCount)
	}
}

func TestLazyMultipleImplementations(t *testing.T) {
	storageTypeTag := NewTag[string]("storage.type")
	filePathTag := NewTag[string]("storage.file.path")

	scope1 := NewScope(
		WithScopeTag(storageTypeTag, "memory"),
	)

	scope2 := NewScope(
		WithScopeTag(storageTypeTag, "file"),
		WithScopeTag(filePathTag, "/var/data"),
	)

	memStorage := Provide(func(ctx *ResolveCtx) (string, error) {
		return "memory-storage", nil
	})

	fileStorage := Provide(func(ctx *ResolveCtx) (string, error) {
		path := GetTagOrDefault(ctx, filePathTag, "./data")
		return "file-storage-at-" + path, nil
	})

	service := Derive2(
		memStorage.Lazy(),
		fileStorage.Lazy(),
		func(ctx *ResolveCtx, memCtrl *Controller[string], fileCtrl *Controller[string]) (string, error) {
			storageType := GetTagOrDefault(ctx, storageTypeTag, "memory")

			switch storageType {
			case "file":
				storage, err := fileCtrl.Get()
				if err != nil {
					return "", err
				}
				return storage, nil
			case "memory":
				storage, err := memCtrl.Get()
				if err != nil {
					return "", err
				}
				return storage, nil
			default:
				return "", nil
			}
		},
	)

	val1, err := Resolve(scope1, service)
	if err != nil {
		t.Fatalf("expected no error for scope1, got %v", err)
	}
	if val1 != "memory-storage" {
		t.Errorf("expected 'memory-storage', got %s", val1)
	}

	val2, err := Resolve(scope2, service)
	if err != nil {
		t.Fatalf("expected no error for scope2, got %v", err)
	}
	if val2 != "file-storage-at-/var/data" {
		t.Errorf("expected 'file-storage-at-/var/data', got %s", val2)
	}
}

func TestLazyErrorHandling(t *testing.T) {
	scope := NewScope()

	failingExec := Provide(func(ctx *ResolveCtx) (int, error) {
		return 0, &testError{msg: "dependency failed"}
	})

	derived := Derive1(
		failingExec.Lazy(),
		func(ctx *ResolveCtx, ctrl *Controller[int]) (int, error) {
			val, err := ctrl.Get()
			if err == nil {
				t.Error("expected error from lazy dependency")
			}
			if err.Error() != "dependency failed" {
				t.Errorf("expected 'dependency failed', got %v", err)
			}
			return val, err
		},
	)

	_, err := Resolve(scope, derived)
	if err == nil {
		t.Fatal("expected error to surface")
	}

	if err.Error() != "dependency failed" {
		t.Errorf("expected 'dependency failed', got %v", err)
	}
}

func TestLazyControllerMethods(t *testing.T) {
	scope := NewScope()

	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 42, nil
	})

	derived := Derive1(
		counter.Lazy(),
		func(ctx *ResolveCtx, ctrl *Controller[int]) (int, error) {
			if ctrl.IsCached() {
				t.Error("lazy dependency should not be cached initially")
			}

			val, ok := ctrl.Peek()
			if ok {
				t.Error("Peek should return false for unresolved lazy dependency")
			}
			if val != 0 {
				t.Errorf("Peek should return zero value, got %d", val)
			}

			firstGet, err := ctrl.Get()
			if err != nil {
				return 0, err
			}
			if firstGet != 42 {
				t.Errorf("expected 42, got %d", firstGet)
			}

			if !ctrl.IsCached() {
				t.Error("dependency should be cached after Get()")
			}

			secondGet, err := ctrl.Get()
			if err != nil {
				return 0, err
			}
			if secondGet != 42 {
				t.Errorf("expected cached value 42, got %d", secondGet)
			}

			err = ctrl.Release()
			if err != nil {
				return 0, err
			}

			if ctrl.IsCached() {
				t.Error("dependency should not be cached after Release()")
			}

			reloaded, err := ctrl.Reload()
			if err != nil {
				return 0, err
			}
			if reloaded != 42 {
				t.Errorf("expected reloaded value 42, got %d", reloaded)
			}

			return firstGet, nil
		},
	)

	val, err := Resolve(scope, derived)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != 42 {
		t.Errorf("expected 42, got %d", val)
	}
}

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}

func TestDerive5(t *testing.T) {
	scope := NewScope()

	d1 := Provide(func(ctx *ResolveCtx) (int, error) { return 1, nil })
	d2 := Provide(func(ctx *ResolveCtx) (int, error) { return 2, nil })
	d3 := Provide(func(ctx *ResolveCtx) (int, error) { return 3, nil })
	d4 := Provide(func(ctx *ResolveCtx) (int, error) { return 4, nil })
	d5 := Provide(func(ctx *ResolveCtx) (int, error) { return 5, nil })

	sum := Derive5(
		d1, d2, d3, d4, d5,
		func(ctx *ResolveCtx, c1, c2, c3, c4, c5 *Controller[int]) (int, error) {
			v1, _ := c1.Get()
			v2, _ := c2.Get()
			v3, _ := c3.Get()
			v4, _ := c4.Get()
			v5, _ := c5.Get()
			return v1 + v2 + v3 + v4 + v5, nil
		},
	)

	val, err := Resolve(scope, sum)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if val != 15 {
		t.Errorf("expected 15, got %d", val)
	}
}

func TestDerive9(t *testing.T) {
	scope := NewScope()

	d1 := Provide(func(ctx *ResolveCtx) (int, error) { return 1, nil })
	d2 := Provide(func(ctx *ResolveCtx) (int, error) { return 2, nil })
	d3 := Provide(func(ctx *ResolveCtx) (int, error) { return 3, nil })
	d4 := Provide(func(ctx *ResolveCtx) (int, error) { return 4, nil })
	d5 := Provide(func(ctx *ResolveCtx) (int, error) { return 5, nil })
	d6 := Provide(func(ctx *ResolveCtx) (int, error) { return 6, nil })
	d7 := Provide(func(ctx *ResolveCtx) (int, error) { return 7, nil })
	d8 := Provide(func(ctx *ResolveCtx) (int, error) { return 8, nil })
	d9 := Provide(func(ctx *ResolveCtx) (int, error) { return 9, nil })

	sum := Derive9(
		d1, d2, d3, d4, d5,
		d6, d7, d8, d9,
		func(ctx *ResolveCtx, c1, c2, c3, c4, c5, c6, c7, c8, c9 *Controller[int]) (int, error) {
			v1, _ := c1.Get()
			v2, _ := c2.Get()
			v3, _ := c3.Get()
			v4, _ := c4.Get()
			v5, _ := c5.Get()
			v6, _ := c6.Get()
			v7, _ := c7.Get()
			v8, _ := c8.Get()
			v9, _ := c9.Get()
			return v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9, nil
		},
	)

	val, err := Resolve(scope, sum)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if val != 45 {
		t.Errorf("expected 45, got %d", val)
	}
}

func TestDeriveMixedTypes(t *testing.T) {
	scope := NewScope()

	intExec := Provide(func(ctx *ResolveCtx) (int, error) { return 42, nil })
	stringExec := Provide(func(ctx *ResolveCtx) (string, error) { return "hello", nil })
	boolExec := Provide(func(ctx *ResolveCtx) (bool, error) { return true, nil })
	floatExec := Provide(func(ctx *ResolveCtx) (float64, error) { return 3.14, nil })

	type result struct {
		num   int
		text  string
		flag  bool
		value float64
	}

	mixed := Derive4(
		intExec,
		stringExec,
		boolExec,
		floatExec,
		func(ctx *ResolveCtx,
			intCtrl *Controller[int],
			strCtrl *Controller[string],
			boolCtrl *Controller[bool],
			floatCtrl *Controller[float64]) (result, error) {

			num, _ := intCtrl.Get()
			text, _ := strCtrl.Get()
			flag, _ := boolCtrl.Get()
			value, _ := floatCtrl.Get()

			return result{num: num, text: text, flag: flag, value: value}, nil
		},
	)

	val, err := Resolve(scope, mixed)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val.num != 42 {
		t.Errorf("expected num=42, got %d", val.num)
	}
	if val.text != "hello" {
		t.Errorf("expected text='hello', got %s", val.text)
	}
	if !val.flag {
		t.Error("expected flag=true")
	}
	if val.value != 3.14 {
		t.Errorf("expected value=3.14, got %f", val.value)
	}
}

func TestPresetValue(t *testing.T) {
	resolveCount := 0
	exec := Provide(func(ctx *ResolveCtx) (int, error) {
		resolveCount++
		return 42, nil
	})

	presetValue := 100
	scope := NewScope(
		WithPreset(exec, presetValue),
	)

	val, err := Resolve(scope, exec)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != 100 {
		t.Errorf("expected 100, got %d", val)
	}

	if resolveCount != 0 {
		t.Errorf("expected factory not to be called, but was called %d times", resolveCount)
	}
}

func TestPresetExecutor(t *testing.T) {
	originalResolveCount := 0
	exec := Provide(func(ctx *ResolveCtx) (int, error) {
		originalResolveCount++
		return 42, nil
	})

	mockResolveCount := 0
	mockExec := Provide(func(ctx *ResolveCtx) (int, error) {
		mockResolveCount++
		return 100, nil
	})

	scope := NewScope(
		WithPreset(exec, mockExec),
	)

	val, err := Resolve(scope, exec)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != 100 {
		t.Errorf("expected 100, got %d", val)
	}

	if originalResolveCount != 0 {
		t.Errorf("expected original factory not to be called, but was called %d times", originalResolveCount)
	}

	if mockResolveCount != 1 {
		t.Errorf("expected mock factory to be called once, got %d", mockResolveCount)
	}
}

func TestPresetWithReactivity(t *testing.T) {
	counter := Provide(func(ctx *ResolveCtx) (int, error) {
		return 0, nil
	})

	doubled := Derive1(
		counter.Reactive(),
		func(ctx *ResolveCtx, counterCtrl *Controller[int]) (int, error) {
			count, err := counterCtrl.Get()
			if err != nil {
				return 0, err
			}
			return count * 2, nil
		},
	)

	scope := NewScope(
		WithPreset(counter, 5),
	)

	val, _ := Resolve(scope, doubled)
	if val != 10 {
		t.Errorf("expected 10, got %d", val)
	}

	counterCtrl := Accessor(scope, counter)
	counterCtrl.Update(10)

	val, _ = Resolve(scope, doubled)
	if val != 20 {
		t.Errorf("expected 20 after update, got %d", val)
	}
}

func TestPresetExecutorWithDeps(t *testing.T) {
	config := Provide(func(ctx *ResolveCtx) (int, error) {
		return 5, nil
	})

	storage := Provide(func(ctx *ResolveCtx) (string, error) {
		return "real-storage", nil
	})

	mockStorage := Derive1(
		config,
		func(ctx *ResolveCtx, configCtrl *Controller[int]) (string, error) {
			cfg, _ := configCtrl.Get()
			return fmt.Sprintf("mock-storage-with-config-%d", cfg), nil
		},
	)

	scope := NewScope(
		WithPreset(storage, mockStorage),
	)

	val, err := Resolve(scope, storage)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if val != "mock-storage-with-config-5" {
		t.Errorf("expected 'mock-storage-with-config-5', got %s", val)
	}
}

func TestCascadingReactivityWithPreset(t *testing.T) {
	grandparent := Provide(func(ctx *ResolveCtx) (int, error) {
		return 0, nil
	})

	parent := Derive1(
		grandparent.Reactive(),
		func(ctx *ResolveCtx, gpCtrl *Controller[int]) (int, error) {
			gp, _ := gpCtrl.Get()
			return gp + 10, nil
		},
	)

	child := Derive1(
		parent.Reactive(),
		func(ctx *ResolveCtx, parentCtrl *Controller[int]) (int, error) {
			p, _ := parentCtrl.Get()
			return p * 2, nil
		},
	)

	scope := NewScope(
		WithPreset(grandparent, 5),
	)

	val, _ := Resolve(scope, child)
	if val != 30 {
		t.Errorf("expected 30 ((5+10)*2), got %d", val)
	}

	gpCtrl := Accessor(scope, grandparent)
	gpCtrl.Update(10)

	val, _ = Resolve(scope, child)
	if val != 40 {
		t.Errorf("expected 40 ((10+10)*2) after cascading update, got %d", val)
	}
}
