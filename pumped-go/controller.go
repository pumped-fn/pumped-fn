package pumped

// Controller provides lifecycle control for an executor's value
type Controller[T any] struct {
	executor *Executor[T]
	scope    *Scope
}

// Get retrieves the latest value (resolves if not cached)
func (c *Controller[T]) Get() (T, error) {
	return Resolve(c.scope, c.executor)
}

// Peek retrieves the cached value without resolving
func (c *Controller[T]) Peek() (T, bool) {
	c.scope.mu.RLock()
	defer c.scope.mu.RUnlock()

	val, ok := c.scope.cache[c.executor]
	if !ok {
		var zero T
		return zero, false
	}
	return val.(T), true
}

// Update sets a new value and propagates to reactive dependents
func (c *Controller[T]) Update(newVal T) error {
	return Update(c.scope, c.executor, newVal)
}

// Set is an alias for Update
func (c *Controller[T]) Set(newVal T) error {
	return c.Update(newVal)
}

// Release invalidates the cached value
func (c *Controller[T]) Release() error {
	c.scope.mu.Lock()
	defer c.scope.mu.Unlock()
	delete(c.scope.cache, c.executor)
	return nil
}

// Reload invalidates and immediately re-resolves
func (c *Controller[T]) Reload() (T, error) {
	if err := c.Release(); err != nil {
		var zero T
		return zero, err
	}
	return c.Get()
}

// IsCached checks if the value is currently cached
func (c *Controller[T]) IsCached() bool {
	c.scope.mu.RLock()
	defer c.scope.mu.RUnlock()
	_, ok := c.scope.cache[c.executor]
	return ok
}
