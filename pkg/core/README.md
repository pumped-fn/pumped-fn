# Core Lane

## Purpose

`pkg/core/` holds the framework-neutral runtime surface. This is the foundation every other lane may
build on.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `lite/` | `@pumped-fn/lite` | Scopes, atoms, flows, resources, tags, presets, controllers, and extensions. |

## Naming

Keep `lite` as the package directory and `@pumped-fn/lite` as the package name. New core packages
need a short directory name that describes a foundational runtime concern, not an integration target.

## Content Rules

Core packages must stay platform-neutral unless a platform appears only behind an explicit adapter
boundary. Public contracts belong in package README and TSDoc where exported types need it.

## Boundaries

React, agent providers, optional extensions, render bindings, examples, and migration tools do not
belong in this lane.
