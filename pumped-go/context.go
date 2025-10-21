package pumped

// ResolveCtx provides context for factory functions
type ResolveCtx struct {
	scope *Scope
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
