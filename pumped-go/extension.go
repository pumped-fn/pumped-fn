package pumped

import "context"

// Extension provides hooks into the execution lifecycle
type Extension interface {
	// Name returns the extension's name
	Name() string

	// Order determines extension execution order (lower = earlier)
	Order() int

	// Init is called when the extension is registered to a scope
	Init(scope *Scope) error

	// Wrap intercepts operations (resolve, update)
	Wrap(ctx context.Context, next func() (any, error), op *Operation) (any, error)

	// OnError handles errors during resolution
	OnError(err error, op *Operation, scope *Scope)

	// OnCleanupError handles cleanup failures
	// Returns true if the error was handled, false to use default behavior
	OnCleanupError(err *CleanupError) bool

	// Flow execution hooks
	OnFlowStart(execCtx *ExecutionCtx, flow AnyFlow) error
	OnFlowEnd(execCtx *ExecutionCtx, result any, err error) error
	OnFlowPanic(execCtx *ExecutionCtx, recovered any, stack []byte) error

	// Dispose is called when the scope is disposed
	Dispose(scope *Scope) error
}

// CleanupError contains information about a cleanup failure
type CleanupError struct {
	ExecutorID AnyExecutor
	Err        error
	Context    string // "reactive" or "dispose"
}

// BaseExtension provides default implementations for Extension methods
type BaseExtension struct {
	name string
}

// NewBaseExtension creates a new base extension with the given name
func NewBaseExtension(name string) BaseExtension {
	return BaseExtension{name: name}
}

func (e *BaseExtension) Name() string {
	return e.name
}

func (e *BaseExtension) Order() int {
	return 100
}

func (e *BaseExtension) Init(scope *Scope) error {
	return nil
}

func (e *BaseExtension) Wrap(ctx context.Context, next func() (any, error), op *Operation) (any, error) {
	return next()
}

func (e *BaseExtension) OnError(err error, op *Operation, scope *Scope) {
}

func (e *BaseExtension) OnCleanupError(err *CleanupError) bool {
	return false
}

func (e *BaseExtension) OnFlowStart(execCtx *ExecutionCtx, flow AnyFlow) error {
	return nil
}

func (e *BaseExtension) OnFlowEnd(execCtx *ExecutionCtx, result any, err error) error {
	return nil
}

func (e *BaseExtension) OnFlowPanic(execCtx *ExecutionCtx, recovered any, stack []byte) error {
	return nil
}

func (e *BaseExtension) Dispose(scope *Scope) error {
	return nil
}

// Operation describes what operation is happening
type Operation struct {
	Kind     OperationKind
	Executor AnyExecutor
	Scope    *Scope
}

// OperationKind represents the type of operation
type OperationKind string

const (
	// OpResolve indicates an executor resolution
	OpResolve OperationKind = "resolve"
	// OpUpdate indicates an executor update
	OpUpdate OperationKind = "update"
)
