# Pumped Functions Expert Agent for Claude Code

Compact, high-density expert agent for @pumped-fn/core-next - TypeScript functional DI/reactive programming library.

## 📁 File

**`pumped-fn.md`** - Complete expert knowledge in ~290 lines

## 🚀 Usage

### Copy to Your Project

```bash
cp .claude/agents/pumped-fn.md YOUR_PROJECT/.claude/agents/
```

The agent provides instant expertise on:

- Executor patterns (provide/derive/preset)
- Controller usage (cleanup/scope access/self-management)
- Reactive programming (.reactive/.static/.lazy variants)
- Memory leak prevention
- Performance optimization
- Testing strategies

## 🎯 Agent Capabilities

This expert agent can help with:

### Code Review & Optimization

- Identify memory leaks and missing cleanups
- Optimize reactive dependency chains
- Improve type inference and type safety
- Spot anti-patterns and suggest best practices

### Implementation Assistance

- Design dependency injection architectures
- Implement reactive state management
- Create testing utilities and mocks
- Build complex async workflows

### Troubleshooting

- Debug "Executor not resolved" errors
- Fix infinite update loops
- Resolve circular dependencies
- Trace reactive update chains

### Advanced Patterns

- Event sourcing with executors
- CQRS implementation
- Saga pattern for workflows
- Plugin systems with dynamic dependencies

## 💡 Example Usage

### Basic Code Review

```typescript
// Your code
const service = derive(database.reactive, (db) => new Service(db));

// Ask: "Review this for best practices"
// Agent will analyze and suggest improvements
```

### Complex Implementation

```
"I need to implement a caching layer that:
- Caches API responses
- Invalidates on user preference changes
- Has TTL support
- Handles errors gracefully"

// Agent will provide complete implementation with pumped-fn
```

### Performance Optimization

```
"My React app re-renders too often when using these executors.
How can I optimize the reactive dependencies?"

// Agent will analyze and provide optimization strategies
```

## 🏗 Agent Architecture

The agent is structured in three layers:

1. **Core Expertise** (`pumped-fn-expert.md`)

   - Deep knowledge of executor system
   - Scope lifecycle management
   - Reactive programming patterns
   - Meta system and validation

2. **Practical Examples** (`pumped-fn-usage-examples.md`)

   - Real-world scenarios
   - Common problems and solutions
   - Integration patterns
   - Testing strategies

3. **Quick Reference** (`pumped-fn-quick-reference.md`)
   - API cheatsheet
   - Decision trees
   - Error decoder
   - Performance guidelines

## 📊 Effectiveness Metrics

The agent excels at:

- ✅ **Accuracy**: Deep understanding of library internals
- ✅ **Context-Awareness**: Considers your existing code patterns
- ✅ **Problem-Solving**: Identifies root causes, not just symptoms
- ✅ **Best Practices**: Recommends idiomatic pumped-fn patterns
- ✅ **Type Safety**: Maintains TypeScript type integrity

## 🔧 Customization

You can extend the agent for your specific needs:

### Add Domain Knowledge

```markdown
## Domain-Specific Patterns

### E-commerce Integration

When using pumped-fn for e-commerce:

- Cart state management with reactive executors
- Order processing with transactional scopes
- Inventory updates with cleanup handlers
```

### Add Team Conventions

```markdown
## Team Conventions

- Always use `name` meta for debugging
- Prefer array syntax for multiple dependencies
- Use `I` prefix for executor interfaces
```

## 🤝 Contributing

To improve this agent:

1. Test with real-world scenarios
2. Document edge cases discovered
3. Add new patterns as they emerge
4. Update with library version changes

## 📚 Resources

- [Pumped Functions Documentation](https://pumped-fn.github.io/pumped-fn/)
- [GitHub Repository](https://github.com/pumped-fn/core)
- Library Version: @pumped-fn/core-next

---

**Latest**: `pumped-fn.md` contains all essential knowledge including controller patterns, static accessor usage, and self-managing executors.
