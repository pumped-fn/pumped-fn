package pumped

//go:generate go run codegen/main.go -w

func Derive1[T any, D1 any](
	d1 Dependency,
	factory func(*ResolveCtx, *Controller[D1]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive2[T any, D1 any, D2 any](
	d1 Dependency,
	d2 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive3[T any, D1 any, D2 any, D3 any](
	d1 Dependency,
	d2 Dependency,
	d3 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2], *Controller[D3]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2, d3},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2, ctrl3)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive4[T any, D1 any, D2 any, D3 any, D4 any](
	d1 Dependency,
	d2 Dependency,
	d3 Dependency,
	d4 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2], *Controller[D3], *Controller[D4]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2, d3, d4},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    ctx.scope,
			}
			ctrl4 := &Controller[D4]{
				executor: d4.GetExecutor().(*Executor[D4]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2, ctrl3, ctrl4)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive5[T any, D1 any, D2 any, D3 any, D4 any, D5 any](
	d1 Dependency,
	d2 Dependency,
	d3 Dependency,
	d4 Dependency,
	d5 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2], *Controller[D3], *Controller[D4], *Controller[D5]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2, d3, d4, d5},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    ctx.scope,
			}
			ctrl4 := &Controller[D4]{
				executor: d4.GetExecutor().(*Executor[D4]),
				scope:    ctx.scope,
			}
			ctrl5 := &Controller[D5]{
				executor: d5.GetExecutor().(*Executor[D5]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2, ctrl3, ctrl4, ctrl5)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive6[T any, D1 any, D2 any, D3 any, D4 any, D5 any, D6 any](
	d1 Dependency,
	d2 Dependency,
	d3 Dependency,
	d4 Dependency,
	d5 Dependency,
	d6 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2], *Controller[D3], *Controller[D4], *Controller[D5], *Controller[D6]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2, d3, d4, d5, d6},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    ctx.scope,
			}
			ctrl4 := &Controller[D4]{
				executor: d4.GetExecutor().(*Executor[D4]),
				scope:    ctx.scope,
			}
			ctrl5 := &Controller[D5]{
				executor: d5.GetExecutor().(*Executor[D5]),
				scope:    ctx.scope,
			}
			ctrl6 := &Controller[D6]{
				executor: d6.GetExecutor().(*Executor[D6]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2, ctrl3, ctrl4, ctrl5, ctrl6)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive7[T any, D1 any, D2 any, D3 any, D4 any, D5 any, D6 any, D7 any](
	d1 Dependency,
	d2 Dependency,
	d3 Dependency,
	d4 Dependency,
	d5 Dependency,
	d6 Dependency,
	d7 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2], *Controller[D3], *Controller[D4], *Controller[D5], *Controller[D6], *Controller[D7]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2, d3, d4, d5, d6, d7},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    ctx.scope,
			}
			ctrl4 := &Controller[D4]{
				executor: d4.GetExecutor().(*Executor[D4]),
				scope:    ctx.scope,
			}
			ctrl5 := &Controller[D5]{
				executor: d5.GetExecutor().(*Executor[D5]),
				scope:    ctx.scope,
			}
			ctrl6 := &Controller[D6]{
				executor: d6.GetExecutor().(*Executor[D6]),
				scope:    ctx.scope,
			}
			ctrl7 := &Controller[D7]{
				executor: d7.GetExecutor().(*Executor[D7]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2, ctrl3, ctrl4, ctrl5, ctrl6, ctrl7)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive8[T any, D1 any, D2 any, D3 any, D4 any, D5 any, D6 any, D7 any, D8 any](
	d1 Dependency,
	d2 Dependency,
	d3 Dependency,
	d4 Dependency,
	d5 Dependency,
	d6 Dependency,
	d7 Dependency,
	d8 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2], *Controller[D3], *Controller[D4], *Controller[D5], *Controller[D6], *Controller[D7], *Controller[D8]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2, d3, d4, d5, d6, d7, d8},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    ctx.scope,
			}
			ctrl4 := &Controller[D4]{
				executor: d4.GetExecutor().(*Executor[D4]),
				scope:    ctx.scope,
			}
			ctrl5 := &Controller[D5]{
				executor: d5.GetExecutor().(*Executor[D5]),
				scope:    ctx.scope,
			}
			ctrl6 := &Controller[D6]{
				executor: d6.GetExecutor().(*Executor[D6]),
				scope:    ctx.scope,
			}
			ctrl7 := &Controller[D7]{
				executor: d7.GetExecutor().(*Executor[D7]),
				scope:    ctx.scope,
			}
			ctrl8 := &Controller[D8]{
				executor: d8.GetExecutor().(*Executor[D8]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2, ctrl3, ctrl4, ctrl5, ctrl6, ctrl7, ctrl8)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

func Derive9[T any, D1 any, D2 any, D3 any, D4 any, D5 any, D6 any, D7 any, D8 any, D9 any](
	d1 Dependency,
	d2 Dependency,
	d3 Dependency,
	d4 Dependency,
	d5 Dependency,
	d6 Dependency,
	d7 Dependency,
	d8 Dependency,
	d9 Dependency,
	factory func(*ResolveCtx, *Controller[D1], *Controller[D2], *Controller[D3], *Controller[D4], *Controller[D5], *Controller[D6], *Controller[D7], *Controller[D8], *Controller[D9]) (T, error),
	opts ...ExecutorOption,
) *Executor[T] {
	exec := &Executor[T]{
		deps: []Dependency{d1, d2, d3, d4, d5, d6, d7, d8, d9},
		factory: func(ctx *ResolveCtx) (T, error) {
			ctrl1 := &Controller[D1]{
				executor: d1.GetExecutor().(*Executor[D1]),
				scope:    ctx.scope,
			}
			ctrl2 := &Controller[D2]{
				executor: d2.GetExecutor().(*Executor[D2]),
				scope:    ctx.scope,
			}
			ctrl3 := &Controller[D3]{
				executor: d3.GetExecutor().(*Executor[D3]),
				scope:    ctx.scope,
			}
			ctrl4 := &Controller[D4]{
				executor: d4.GetExecutor().(*Executor[D4]),
				scope:    ctx.scope,
			}
			ctrl5 := &Controller[D5]{
				executor: d5.GetExecutor().(*Executor[D5]),
				scope:    ctx.scope,
			}
			ctrl6 := &Controller[D6]{
				executor: d6.GetExecutor().(*Executor[D6]),
				scope:    ctx.scope,
			}
			ctrl7 := &Controller[D7]{
				executor: d7.GetExecutor().(*Executor[D7]),
				scope:    ctx.scope,
			}
			ctrl8 := &Controller[D8]{
				executor: d8.GetExecutor().(*Executor[D8]),
				scope:    ctx.scope,
			}
			ctrl9 := &Controller[D9]{
				executor: d9.GetExecutor().(*Executor[D9]),
				scope:    ctx.scope,
			}
			return factory(ctx, ctrl1, ctrl2, ctrl3, ctrl4, ctrl5, ctrl6, ctrl7, ctrl8, ctrl9)
		},
		tags: make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}

