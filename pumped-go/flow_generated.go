package pumped

//go:generate go run codegen/main.go -flow -w

func Flow1[R, D1 any](
	d1 Dependency,
	factory func(*ExecutionCtx, *Controller[D1]) (R, error),
	opts ...FlowOption,
) *Flow[R] {
	if _, ok := d1.GetExecutor().(*Executor[D1]); !ok {
		panic("Flow1: dependency type mismatch")
	}

	cfg := &flowConfig{
		tags: make(map[any]any),
	}
	for _, opt := range opts {
		opt(cfg)
	}

	flow := &Flow[R]{
		deps: []Dependency{d1},
		factory: func(execCtx *ExecutionCtx, resolveCtx *ResolveCtx) (R, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    execCtx.scope,
			}
			return factory(execCtx, ctrl1)
		},
		tags: cfg.tags,
	}

	return flow
}

func Flow2[R, D1, D2 any](
	d1, d2 Dependency,
	factory func(*ExecutionCtx, *Controller[D1], *Controller[D2]) (R, error),
	opts ...FlowOption,
) *Flow[R] {
	if _, ok := d1.GetExecutor().(*Executor[D1]); !ok {
		panic("Flow2: dependency 1 type mismatch")
	}
	if _, ok := d2.GetExecutor().(*Executor[D2]); !ok {
		panic("Flow2: dependency 2 type mismatch")
	}

	cfg := &flowConfig{
		tags: make(map[any]any),
	}
	for _, opt := range opts {
		opt(cfg)
	}

	flow := &Flow[R]{
		deps: []Dependency{d1, d2},
		factory: func(execCtx *ExecutionCtx, resolveCtx *ResolveCtx) (R, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    execCtx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    execCtx.scope,
			}
			return factory(execCtx, ctrl1, ctrl2)
		},
		tags: cfg.tags,
	}

	return flow
}

func Flow3[R, D1, D2, D3 any](
	d1, d2, d3 Dependency,
	factory func(*ExecutionCtx, *Controller[D1], *Controller[D2], *Controller[D3]) (R, error),
	opts ...FlowOption,
) *Flow[R] {
	if _, ok := d1.GetExecutor().(*Executor[D1]); !ok {
		panic("Flow3: dependency 1 type mismatch")
	}
	if _, ok := d2.GetExecutor().(*Executor[D2]); !ok {
		panic("Flow3: dependency 2 type mismatch")
	}
	if _, ok := d3.GetExecutor().(*Executor[D3]); !ok {
		panic("Flow3: dependency 3 type mismatch")
	}

	cfg := &flowConfig{
		tags: make(map[any]any),
	}
	for _, opt := range opts {
		opt(cfg)
	}

	flow := &Flow[R]{
		deps: []Dependency{d1, d2, d3},
		factory: func(execCtx *ExecutionCtx, resolveCtx *ResolveCtx) (R, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    execCtx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    execCtx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    execCtx.scope,
			}
			return factory(execCtx, ctrl1, ctrl2, ctrl3)
		},
		tags: cfg.tags,
	}

	return flow
}
