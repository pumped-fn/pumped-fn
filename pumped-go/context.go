package pumped

import "sync"

type cleanupEntry struct {
	fn    func() error
	order int
}

// ResolveCtx provides context for factory functions
type ResolveCtx struct {
	scope      *Scope
	cleanups   []cleanupEntry
	cleanupMu  sync.Mutex
	executorID AnyExecutor
}

// OnCleanup registers a cleanup function to be called when the executor is disposed
// Extensions can read tags from the executor to determine cleanup behavior
func (ctx *ResolveCtx) OnCleanup(fn func() error) {
	ctx.cleanupMu.Lock()
	defer ctx.cleanupMu.Unlock()

	entry := cleanupEntry{
		fn:    fn,
		order: len(ctx.cleanups),
	}
	ctx.cleanups = append(ctx.cleanups, entry)
}

// GetTag retrieves a tag value from the scope
func (ctx *ResolveCtx) GetTag(tag any) (any, bool) {
	return ctx.scope.GetTag(tag)
}

// GetTag retrieves a typed tag value from the scope
func GetTag[T any](ctx *ResolveCtx, tag Tag[T]) (T, bool) {
	return tag.GetFromScope(ctx.scope)
}

// GetTagOrDefault retrieves a typed tag or returns a default value
func GetTagOrDefault[T any](ctx *ResolveCtx, tag Tag[T], defaultVal T) T {
	if val, ok := tag.GetFromScope(ctx.scope); ok {
		return val
	}
	return defaultVal
}
