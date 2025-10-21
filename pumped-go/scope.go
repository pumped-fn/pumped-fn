package pumped

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"
)

// Scope manages the lifecycle and resolution of executors
type Scope struct {
	mu              sync.RWMutex
	cache           map[AnyExecutor]any
	tags            map[any]any
	downstream      map[AnyExecutor][]reactiveDependent
	extensions      []Extension
	presets         map[AnyExecutor]preset
	cleanupRegistry map[AnyExecutor][]cleanupEntry
	cleanupMu       sync.RWMutex
	execTree        *ExecutionTree
	idCounter       uint64
}

type reactiveDependent struct {
	executor AnyExecutor
}

type preset struct {
	value    any
	executor AnyExecutor
	isValue  bool
}

// ScopeOption is a modifier for scopes
type ScopeOption func(*Scope)

// WithScopeTag returns an option that sets a tag on a scope
func WithScopeTag[T any](tag Tag[T], val T) ScopeOption {
	return func(s *Scope) {
		tag.SetOnScope(s, val)
	}
}

// WithExtension returns an option that registers an extension to a scope
func WithExtension(ext Extension) ScopeOption {
	return func(s *Scope) {
		s.UseExtension(ext)
	}
}

// WithPreset returns an option that sets a preset for an executor
func WithPreset[T any](original *Executor[T], replacement any) ScopeOption {
	return func(s *Scope) {
		switch r := replacement.(type) {
		case T:
			s.presets[original] = preset{
				value:   r,
				isValue: true,
			}
		case *Executor[T]:
			s.presets[original] = preset{
				executor: r,
				isValue:  false,
			}
		default:
			panic(fmt.Sprintf("preset must be value of type %T or *Executor[%T]", *new(T), *new(T)))
		}
	}
}

// NewScope creates a new scope with optional configuration
func NewScope(opts ...ScopeOption) *Scope {
	s := &Scope{
		cache:           make(map[AnyExecutor]any),
		tags:            make(map[any]any),
		downstream:      make(map[AnyExecutor][]reactiveDependent),
		extensions:      []Extension{},
		presets:         make(map[AnyExecutor]preset),
		cleanupRegistry: make(map[AnyExecutor][]cleanupEntry),
		execTree:        newExecutionTree(1000),
		idCounter:       0,
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// Accessor creates a controller for an executor
func Accessor[T any](s *Scope, exec *Executor[T]) *Controller[T] {
	return &Controller[T]{
		executor: exec,
		scope:    s,
	}
}

// Resolve resolves an executor's value (lazily, with caching)
func Resolve[T any](s *Scope, exec *Executor[T]) (T, error) {
	s.mu.RLock()
	if val, ok := s.cache[exec]; ok {
		s.mu.RUnlock()
		return val.(T), nil
	}
	s.mu.RUnlock()

	// Build reactive graph
	s.mu.Lock()
	for _, dep := range exec.deps {
		if dep.GetMode() == ModeReactive {
			s.downstream[dep.GetExecutor()] = append(
				s.downstream[dep.GetExecutor()],
				reactiveDependent{executor: exec},
			)
		}
	}
	s.mu.Unlock()

	// Check for preset
	s.mu.RLock()
	preset, hasPreset := s.presets[exec]
	exts := s.extensions
	s.mu.RUnlock()

	if hasPreset {
		if preset.isValue {
			// Value preset - cache and return
			s.mu.Lock()
			s.cache[exec] = preset.value
			s.mu.Unlock()
			return preset.value.(T), nil
		}

		// Executor preset - resolve replacement
		val, err := preset.executor.ResolveAny(s)
		if err != nil {
			var zero T
			return zero, err
		}

		s.mu.Lock()
		s.cache[exec] = val
		s.mu.Unlock()

		return val.(T), nil
	}

	// Resolve dependencies first (skip lazy dependencies)
	for _, dep := range exec.deps {
		if dep.GetMode() == ModeLazy {
			continue
		}
		_, err := dep.GetExecutor().ResolveAny(s)
		if err != nil {
			var zero T
			return zero, err
		}
	}

	// Wrap resolution with extensions
	op := &Operation{
		Kind:     OpResolve,
		Executor: exec,
		Scope:    s,
	}

	var result any
	var err error

	// Chain extensions (middleware pattern)
	next := func() (any, error) {
		return exec.ResolveAny(s)
	}

	// Apply extensions in reverse order (last registered wraps first)
	for i := len(exts) - 1; i >= 0; i-- {
		ext := exts[i]
		currentNext := next
		next = func() (any, error) {
			return ext.Wrap(context.Background(), currentNext, op)
		}
	}

	result, err = next()

	if err != nil {
		// Notify extensions of error
		for _, ext := range exts {
			ext.OnError(err, op, s)
		}
		var zero T
		return zero, err
	}

	s.mu.Lock()
	s.cache[exec] = result
	s.mu.Unlock()

	return result.(T), nil
}

// Update changes an executor's cached value and propagates to reactive dependents
func Update[T any](s *Scope, exec *Executor[T], newVal T) error {
	// Wrap update with extensions
	s.mu.RLock()
	exts := s.extensions
	s.mu.RUnlock()

	op := &Operation{
		Kind:     OpUpdate,
		Executor: exec,
		Scope:    s,
	}

	next := func() (any, error) {
		s.mu.Lock()
		toInvalidate := s.findReactiveDependents(exec)
		s.mu.Unlock()

		for _, dependent := range toInvalidate {
			s.cleanupExecutor(dependent)
		}

		s.mu.Lock()
		s.cache[exec] = newVal

		for _, dependent := range toInvalidate {
			delete(s.cache, dependent)
		}
		s.mu.Unlock()

		return nil, nil
	}

	// Apply extensions
	for i := len(exts) - 1; i >= 0; i-- {
		ext := exts[i]
		currentNext := next
		next = func() (any, error) {
			return ext.Wrap(context.Background(), currentNext, op)
		}
	}

	_, err := next()
	return err
}

// findReactiveDependents walks the dependency graph to find all reactive dependents
func (s *Scope) findReactiveDependents(exec AnyExecutor) []AnyExecutor {
	var result []AnyExecutor
	visited := make(map[AnyExecutor]bool)

	var walk func(AnyExecutor)
	walk = func(current AnyExecutor) {
		if visited[current] {
			return
		}
		visited[current] = true

		for _, dep := range s.downstream[current] {
			result = append(result, dep.executor)
			walk(dep.executor)
		}
	}

	walk(exec)
	return result
}

// UseExtension registers an extension to the scope
func (s *Scope) UseExtension(ext Extension) error {
	s.mu.Lock()
	s.extensions = append(s.extensions, ext)
	sort.Slice(s.extensions, func(i, j int) bool {
		return s.extensions[i].Order() < s.extensions[j].Order()
	})
	s.mu.Unlock()

	return ext.Init(s)
}

func (s *Scope) registerCleanups(exec AnyExecutor, entries []cleanupEntry) {
	if len(entries) == 0 {
		return
	}

	s.cleanupMu.Lock()
	defer s.cleanupMu.Unlock()
	s.cleanupRegistry[exec] = entries
}

func (s *Scope) cleanupExecutor(exec AnyExecutor) {
	s.cleanupMu.Lock()
	entries := s.cleanupRegistry[exec]
	delete(s.cleanupRegistry, exec)
	s.cleanupMu.Unlock()

	if len(entries) == 0 {
		return
	}

	s.runCleanups(entries, exec, "reactive")
}

func (s *Scope) runCleanups(entries []cleanupEntry, exec AnyExecutor, cleanupContext string) {
	s.mu.RLock()
	exts := make([]Extension, len(s.extensions))
	copy(exts, s.extensions)
	s.mu.RUnlock()

	for i := len(entries) - 1; i >= 0; i-- {
		entry := entries[i]

		if err := entry.fn(); err != nil {
			cleanupErr := &CleanupError{
				ExecutorID: exec,
				Err:        err,
				Context:    cleanupContext,
			}

			handled := false
			for _, ext := range exts {
				if ext.OnCleanupError(cleanupErr) {
					handled = true
					break
				}
			}

			if !handled {
			}
		}
	}
}

// Dispose cleans up the scope and all its extensions
func (s *Scope) Dispose() error {
	s.cleanupMu.Lock()
	allEntries := make([]struct {
		exec    AnyExecutor
		entries []cleanupEntry
	}, 0, len(s.cleanupRegistry))

	for exec, entries := range s.cleanupRegistry {
		allEntries = append(allEntries, struct {
			exec    AnyExecutor
			entries []cleanupEntry
		}{exec, entries})
	}
	s.cleanupMu.Unlock()

	for i := len(allEntries) - 1; i >= 0; i-- {
		s.runCleanups(allEntries[i].entries, allEntries[i].exec, "dispose")
	}

	s.mu.RLock()
	exts := make([]Extension, len(s.extensions))
	copy(exts, s.extensions)
	s.mu.RUnlock()

	for _, ext := range exts {
		if err := ext.Dispose(s); err != nil {
			return fmt.Errorf("disposing extension %s: %w", ext.Name(), err)
		}
	}

	return nil
}

// GetTag retrieves a tag value from the scope
func (s *Scope) GetTag(tag any) (any, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	val, ok := s.tags[tag]
	return val, ok
}

// SetTag stores a tag value on the scope
func (s *Scope) SetTag(tag any, val any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tags[tag] = val
}

// GetExecutionTree returns the execution tree for querying
func (s *Scope) GetExecutionTree() *ExecutionTree {
	return s.execTree
}

func (s *Scope) generateExecutionID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.idCounter++
	return fmt.Sprintf("exec-%d", s.idCounter)
}

func Exec[R any](s *Scope, ctx context.Context, flow *Flow[R]) (R, *ExecutionCtx, error) {
	var zero R

	for _, dep := range flow.deps {
		if dep.GetMode() == ModeLazy {
			continue
		}
		_, err := dep.GetExecutor().ResolveAny(s)
		if err != nil {
			return zero, nil, fmt.Errorf("resolving dependency: %w", err)
		}
	}

	execCtx := &ExecutionCtx{
		id:     s.generateExecutionID(),
		parent: nil,
		scope:  s,
		data:   make(map[any]any),
		ctx:    ctx,
	}

	if name, ok := flow.GetTag(flowNameTag); ok {
		execCtx.Set(flowNameTag, name)
	}

	execCtx.Set(startTimeTag, time.Now())
	execCtx.Set(statusTag, ExecutionStatusRunning)

	s.mu.RLock()
	exts := make([]Extension, len(s.extensions))
	copy(exts, s.extensions)
	s.mu.RUnlock()

	for _, ext := range exts {
		if err := ext.OnFlowStart(execCtx, flow); err != nil {
			execCtx.Set(statusTag, ExecutionStatusFailed)
			execCtx.Set(errorTag, err)
			return zero, execCtx, err
		}
	}

	result, err := executeFlow(execCtx, flow)

	execCtx.Set(endTimeTag, time.Now())
	if err != nil {
		execCtx.Set(statusTag, ExecutionStatusFailed)
		execCtx.Set(errorTag, err)
	} else {
		execCtx.Set(statusTag, ExecutionStatusSuccess)
		execCtx.Set(outputTag, result)
	}

	for i := len(exts) - 1; i >= 0; i-- {
		if extErr := exts[i].OnFlowEnd(execCtx, result, err); extErr != nil && err == nil {
			err = extErr
		}
	}

	node := execCtx.finalize()
	s.execTree.addNode(node)

	return result, execCtx, err
}
