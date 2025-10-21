package pumped

// Tag is a type-safe key for metadata
type Tag[T any] struct {
	key string
}

// NewTag creates a new tag with the given key
func NewTag[T any](key string) Tag[T] {
	return Tag[T]{key: key}
}

// Key returns the tag's key (for debugging)
func (t Tag[T]) Key() string {
	return t.key
}

// Get retrieves the tag value from an executor
func (t Tag[T]) Get(exec AnyExecutor) (T, bool) {
	val, ok := exec.GetTag(t)
	if !ok {
		var zero T
		return zero, false
	}
	return val.(T), true
}

// MustGet retrieves the tag value or panics if not found
func (t Tag[T]) MustGet(exec AnyExecutor) T {
	val, ok := t.Get(exec)
	if !ok {
		panic("tag " + t.key + " not found")
	}
	return val
}

// GetOrDefault retrieves the tag value or returns a default
func (t Tag[T]) GetOrDefault(exec AnyExecutor, defaultVal T) T {
	if val, ok := t.Get(exec); ok {
		return val
	}
	return defaultVal
}

// Set stores the tag value on an executor
func (t Tag[T]) Set(exec AnyExecutor, val T) {
	exec.SetTag(t, val)
}

// GetFromScope retrieves the tag value from a scope
func (t Tag[T]) GetFromScope(scope *Scope) (T, bool) {
	val, ok := scope.GetTag(t)
	if !ok {
		var zero T
		return zero, false
	}
	return val.(T), true
}

// SetOnScope stores the tag value on a scope
func (t Tag[T]) SetOnScope(scope *Scope, val T) {
	scope.SetTag(t, val)
}
