# Pumped-fn References

This directory contains reference documentation for AI models and library contributors.

## Diagrams

Scenario-based diagrams explaining library internals:

- [internal-flow-execution.md](./diagrams/internal-flow-execution.md) - Flow execution implementation details
- [internal-cleanup-order.md](./diagrams/internal-cleanup-order.md) - Cleanup order (LIFO) implementation

## User-Facing Diagrams

User documentation diagrams are in `docs/diagrams/scenarios/`:

- `01-flow-lifecycle-happy-path.md` - Normal flow execution lifecycle
- `02-error-propagation.md` - Error handling and propagation
- `03-parallel-execution-order.md` - Parallel flow timing
- `04-error-tracing-root-cause.md` - Debugging errors

## Troubleshooting

See `docs/guides/troubleshooting.md` for symptom-based index linking to diagrams.
