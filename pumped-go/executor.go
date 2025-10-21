package pumped

// Executor represents a unit of computation with dependencies
type Executor[T any] struct {
	factory func(*ResolveCtx) (T, error)
	deps    []Dependency
	tags    map[any]any
}

// AnyExecutor is a type-erased interface for dependency tracking
type AnyExecutor interface {
	ResolveAny(*Scope) (any, error)
	GetDeps() []Dependency
	GetTag(tag any) (any, bool)
	SetTag(tag any, val any)
}

func (e *Executor[T]) GetDeps() []Dependency {
	return e.deps
}

func (e *Executor[T]) GetTag(tag any) (any, bool) {
	val, ok := e.tags[tag]
	return val, ok
}

func (e *Executor[T]) SetTag(tag any, val any) {
	e.tags[tag] = val
}

func (e *Executor[T]) ResolveAny(s *Scope) (any, error) {
	ctx := &ResolveCtx{scope: s}
	return e.factory(ctx)
}

// DependencyMode defines how a dependency behaves
type DependencyMode string

const (
	// ModeStatic resolves once and caches forever
	ModeStatic DependencyMode = "static"
	// ModeReactive invalidates when dependency changes
	ModeReactive DependencyMode = "reactive"
	// ModeLazy defers resolution until explicitly requested
	ModeLazy DependencyMode = "lazy"
)

// Dependency represents an executor with its resolution mode
type Dependency interface {
	GetExecutor() AnyExecutor
	GetMode() DependencyMode
}

// dependencyWrapper wraps an executor with a specific mode
type dependencyWrapper struct {
	executor AnyExecutor
	mode     DependencyMode
}

func (d *dependencyWrapper) GetExecutor() AnyExecutor {
	return d.executor
}

func (d *dependencyWrapper) GetMode() DependencyMode {
	return d.mode
}

// Executor implements Dependency interface (default: static mode)
func (e *Executor[T]) GetExecutor() AnyExecutor {
	return e
}

func (e *Executor[T]) GetMode() DependencyMode {
	return ModeStatic
}

// Reactive returns a reactive dependency variant
func (e *Executor[T]) Reactive() Dependency {
	return &dependencyWrapper{executor: e, mode: ModeReactive}
}

// Lazy returns a lazy dependency variant
func (e *Executor[T]) Lazy() Dependency {
	return &dependencyWrapper{executor: e, mode: ModeLazy}
}

// ExecutorOption is a modifier for executors
type ExecutorOption func(AnyExecutor)

// WithTag returns an option that sets a tag on an executor
func WithTag[T any](tag Tag[T], val T) ExecutorOption {
	return func(exec AnyExecutor) {
		tag.Set(exec, val)
	}
}

// Provide creates an executor with no dependencies
func Provide[T any](factory func(*ResolveCtx) (T, error), opts ...ExecutorOption) *Executor[T] {
	exec := &Executor[T]{
		factory: factory,
		deps:    nil,
		tags:    make(map[any]any),
	}

	for _, opt := range opts {
		opt(exec)
	}

	return exec
}
