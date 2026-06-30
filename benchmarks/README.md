# Benchmarks

## Purpose

`benchmarks/` holds private workspace packages for measured performance work.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `lite-perf/` | `@pumped-fn/lite-perf` | Lite runtime and reactivity performance harnesses. |

## Naming

Benchmark directories use `<surface>-perf`. The surface should name the package or runtime behavior
being measured.

## Content Rules

Benchmarks need reproducible inputs, committed harness code, and clear README instructions. Results
should name the command, environment, and comparison point.

## Boundaries

Do not put ad hoc profiling scraps or product examples here. If a benchmark becomes a correctness
regression test, move or mirror the assertion into the relevant package tests.
