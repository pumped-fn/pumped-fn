package pumped

import (
	"context"
	"fmt"
	"runtime/debug"
	"sync"
	"time"
)

type AnyFlow interface {
	GetDeps() []Dependency
	GetTag(tag any) (any, bool)
	SetTag(tag any, val any)
	ExecuteAny(*ExecutionCtx) (any, error)
}

type Flow[R any] struct {
	deps    []Dependency
	factory func(*ExecutionCtx, *ResolveCtx) (R, error)
	tags    map[any]any
}

func (f *Flow[R]) GetDeps() []Dependency {
	return f.deps
}

func (f *Flow[R]) GetTag(tag any) (any, bool) {
	val, ok := f.tags[tag]
	return val, ok
}

func (f *Flow[R]) SetTag(tag any, val any) {
	f.tags[tag] = val
}

func (f *Flow[R]) ExecuteAny(ctx *ExecutionCtx) (any, error) {
	return executeFlow(ctx, f)
}

type ExecutionCtx struct {
	id     string
	parent *ExecutionCtx
	scope  *Scope
	data   map[any]any
	ctx    context.Context
}

func (e *ExecutionCtx) Set(tag any, value any) {
	e.data[tag] = value
}

func (e *ExecutionCtx) Get(tag any) (any, bool) {
	v, ok := e.data[tag]
	return v, ok
}

func (e *ExecutionCtx) GetFromParent(tag any) (any, bool) {
	current := e.parent
	for current != nil {
		if v, ok := current.data[tag]; ok {
			return v, true
		}
		current = current.parent
	}
	return nil, false
}

func (e *ExecutionCtx) GetFromScope(tag any) (any, bool) {
	return e.scope.GetTag(tag)
}

func (e *ExecutionCtx) Lookup(tag any) (any, bool) {
	if v, ok := e.Get(tag); ok {
		return v, true
	}
	if v, ok := e.GetFromParent(tag); ok {
		return v, true
	}
	return e.GetFromScope(tag)
}

func (e *ExecutionCtx) Context() context.Context {
	return e.ctx
}

func (e *ExecutionCtx) Parallel(opts ...ParallelOption) *ParallelExecutor {
	pe := &ParallelExecutor{
		ctx:       e,
		errorMode: ErrorModeFailFast,
	}
	for _, opt := range opts {
		opt(pe)
	}
	return pe
}

func (e *ExecutionCtx) finalize() *ExecutionNode {
	parentID := ""
	if e.parent != nil {
		parentID = e.parent.id
	}

	node := &ExecutionNode{
		ID:       e.id,
		ParentID: parentID,
		Tags:     make(map[any]any),
	}

	for k, v := range e.data {
		node.Tags[k] = v
	}

	return node
}

type ExecutionNode struct {
	ID       string
	ParentID string
	Tags     map[any]any
}

func (n *ExecutionNode) GetTag(tag any) (any, bool) {
	v, ok := n.Tags[tag]
	return v, ok
}

func (n *ExecutionNode) GetAllTags() map[any]any {
	return n.Tags
}

type ExecutionTree struct {
	mu       sync.RWMutex
	nodes    map[string]*ExecutionNode
	byParent map[string][]string
	roots    []string
	limit    int
}

func newExecutionTree(limit int) *ExecutionTree {
	return &ExecutionTree{
		nodes:    make(map[string]*ExecutionNode),
		byParent: make(map[string][]string),
		roots:    []string{},
		limit:    limit,
	}
}

func (t *ExecutionTree) addNode(node *ExecutionNode) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.nodes[node.ID] = node

	if node.ParentID == "" {
		t.roots = append(t.roots, node.ID)
	} else {
		t.byParent[node.ParentID] = append(t.byParent[node.ParentID], node.ID)
	}

	if len(t.nodes) > t.limit {
		t.evictOldest()
	}
}

func (t *ExecutionTree) evictOldest() {
	if len(t.roots) == 0 {
		return
	}

	oldestRoot := t.roots[0]
	t.roots = t.roots[1:]

	t.removeSubtree(oldestRoot)
}

func (t *ExecutionTree) removeSubtree(nodeID string) {
	delete(t.nodes, nodeID)

	children := t.byParent[nodeID]
	delete(t.byParent, nodeID)

	for _, childID := range children {
		t.removeSubtree(childID)
	}
}

func (t *ExecutionTree) GetNode(id string) *ExecutionNode {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.nodes[id]
}

func (t *ExecutionTree) GetChildren(id string) []*ExecutionNode {
	t.mu.RLock()
	defer t.mu.RUnlock()

	childIDs := t.byParent[id]
	children := make([]*ExecutionNode, 0, len(childIDs))
	for _, childID := range childIDs {
		if node := t.nodes[childID]; node != nil {
			children = append(children, node)
		}
	}
	return children
}

func (t *ExecutionTree) GetRoots() []*ExecutionNode {
	t.mu.RLock()
	defer t.mu.RUnlock()

	roots := make([]*ExecutionNode, 0, len(t.roots))
	for _, rootID := range t.roots {
		if node := t.nodes[rootID]; node != nil {
			roots = append(roots, node)
		}
	}
	return roots
}

func (t *ExecutionTree) Filter(predicate func(*ExecutionNode) bool) []*ExecutionNode {
	t.mu.RLock()
	defer t.mu.RUnlock()

	var result []*ExecutionNode
	for _, node := range t.nodes {
		if predicate(node) {
			result = append(result, node)
		}
	}
	return result
}

func (t *ExecutionTree) Walk(rootID string, visitor func(*ExecutionNode) bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	node := t.nodes[rootID]
	if node == nil {
		return
	}

	if !visitor(node) {
		return
	}

	for _, childID := range t.byParent[rootID] {
		t.walkUnlocked(childID, visitor)
	}
}

func (t *ExecutionTree) walkUnlocked(nodeID string, visitor func(*ExecutionNode) bool) {
	node := t.nodes[nodeID]
	if node == nil {
		return
	}

	if !visitor(node) {
		return
	}

	for _, childID := range t.byParent[nodeID] {
		t.walkUnlocked(childID, visitor)
	}
}

type ParallelExecutor struct {
	ctx       *ExecutionCtx
	errorMode ErrorMode
}

type ErrorMode int

const (
	ErrorModeFailFast ErrorMode = iota
	ErrorModeCollectErrors
)

type ParallelOption func(*ParallelExecutor)

func WithFailFast() ParallelOption {
	return func(pe *ParallelExecutor) {
		pe.errorMode = ErrorModeFailFast
	}
}

func WithCollectErrors() ParallelOption {
	return func(pe *ParallelExecutor) {
		pe.errorMode = ErrorModeCollectErrors
	}
}

type FlowError struct {
	Index    int
	FlowName string
	Err      error
}

type FlowOption func(*flowConfig)

type flowConfig struct {
	tags map[any]any
}

func WithFlowTag[T any](tag Tag[T], val T) FlowOption {
	return func(cfg *flowConfig) {
		cfg.tags[tag] = val
	}
}

func (cfg *flowConfig) GetTag(tag any) (any, bool) {
	val, ok := cfg.tags[tag]
	return val, ok
}

func (cfg *flowConfig) SetTag(tag any, val any) {
	cfg.tags[tag] = val
}

type ExecutionStatus int

const (
	ExecutionStatusRunning ExecutionStatus = iota
	ExecutionStatusSuccess
	ExecutionStatusFailed
)

var (
	flowNameTag   = NewTag[string]("flow.name")
	timeoutTag    = NewTag[time.Duration]("flow.timeout")
	retryTag      = NewTag[int]("flow.retry")
	startTimeTag  = NewTag[time.Time]("exec.start_time")
	endTimeTag    = NewTag[time.Time]("exec.end_time")
	statusTag     = NewTag[ExecutionStatus]("exec.status")
	errorTag      = NewTag[error]("exec.error")
	inputTag      = NewTag[any]("exec.input")
	outputTag     = NewTag[any]("exec.output")
	resumedTag    = NewTag[bool]("exec.resumed")
	cachedTag     = NewTag[any]("exec.cached_output")
	skipExecTag   = NewTag[bool]("exec.skip")
	panicStackTag = NewTag[[]byte]("exec.panic_stack")
)

func FlowName() Tag[string]          { return flowNameTag }
func Timeout() Tag[time.Duration]    { return timeoutTag }
func Retry() Tag[int]                { return retryTag }
func StartTime() Tag[time.Time]      { return startTimeTag }
func EndTime() Tag[time.Time]        { return endTimeTag }
func Status() Tag[ExecutionStatus]   { return statusTag }
func ErrorTag() Tag[error]           { return errorTag }
func Input() Tag[any]                { return inputTag }
func Output() Tag[any]               { return outputTag }
func Resumed() Tag[bool]             { return resumedTag }
func CachedOutput() Tag[any]         { return cachedTag }
func SkipExecution() Tag[bool]       { return skipExecTag }
func PanicStack() Tag[[]byte]        { return panicStackTag }

func Exec1[R any](e *ExecutionCtx, flow *Flow[R]) (R, *ExecutionCtx, error) {
	var zero R

	for _, dep := range flow.deps {
		if dep.GetMode() == ModeLazy {
			continue
		}
		_, err := dep.GetExecutor().ResolveAny(e.scope)
		if err != nil {
			return zero, nil, fmt.Errorf("resolving dependency: %w", err)
		}
	}

	childCtx := &ExecutionCtx{
		id:     e.scope.generateExecutionID(),
		parent: e,
		scope:  e.scope,
		data:   make(map[any]any),
		ctx:    e.ctx,
	}

	if name, ok := flow.GetTag(flowNameTag); ok {
		childCtx.Set(flowNameTag, name)
	}

	childCtx.Set(startTimeTag, time.Now())
	childCtx.Set(statusTag, ExecutionStatusRunning)

	e.scope.mu.RLock()
	exts := make([]Extension, len(e.scope.extensions))
	copy(exts, e.scope.extensions)
	e.scope.mu.RUnlock()

	for _, ext := range exts {
		if err := ext.OnFlowStart(childCtx, flow); err != nil {
			childCtx.Set(statusTag, ExecutionStatusFailed)
			childCtx.Set(errorTag, err)
			return zero, childCtx, err
		}
	}

	if skip, ok := childCtx.Get(skipExecTag); ok && skip.(bool) {
		if cached, ok := childCtx.Get(cachedTag); ok {
			childCtx.Set(endTimeTag, time.Now())
			childCtx.Set(statusTag, ExecutionStatusSuccess)
			childCtx.Set(outputTag, cached)

			for i := len(exts) - 1; i >= 0; i-- {
				exts[i].OnFlowEnd(childCtx, cached, nil)
			}

			node := childCtx.finalize()
			e.scope.execTree.addNode(node)

			return cached.(R), childCtx, nil
		}
	}

	result, err := executeFlow(childCtx, flow)

	childCtx.Set(endTimeTag, time.Now())
	if err != nil {
		childCtx.Set(statusTag, ExecutionStatusFailed)
		childCtx.Set(errorTag, err)
	} else {
		childCtx.Set(statusTag, ExecutionStatusSuccess)
		childCtx.Set(outputTag, result)
	}

	for i := len(exts) - 1; i >= 0; i-- {
		if extErr := exts[i].OnFlowEnd(childCtx, result, err); extErr != nil && err == nil {
			err = extErr
		}
	}

	node := childCtx.finalize()
	e.scope.execTree.addNode(node)

	return result, childCtx, err
}

func executeFlow[R any](e *ExecutionCtx, flow *Flow[R]) (result R, err error) {
	defer func() {
		if r := recover(); r != nil {
			stack := debug.Stack()
			err = fmt.Errorf("panic in flow: %v", r)
			e.Set(panicStackTag, stack)
			e.Set(errorTag, err)

			e.scope.mu.RLock()
			exts := make([]Extension, len(e.scope.extensions))
			copy(exts, e.scope.extensions)
			e.scope.mu.RUnlock()

			for _, ext := range exts {
				ext.OnFlowPanic(e, r, stack)
			}
		}
	}()

	resolveCtx := &ResolveCtx{
		scope: e.scope,
	}

	result, err = flow.factory(e, resolveCtx)
	return
}
