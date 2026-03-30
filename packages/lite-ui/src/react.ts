import type { ComponentType } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScopeProvider } from '@pumped-fn/lite-react'
import { track } from '@pumped-fn/lite'
import { DIRECTIVE_BRAND, subscribeToControllers, type Directive, type MountContext, type ReactiveBinding } from './index'

export function react<P extends Record<string, unknown>>(
  component: ComponentType<P>,
  props: () => P,
): Directive {
  return {
    [DIRECTIVE_BRAND]: true,
    mount(container: HTMLElement, ctx: MountContext) {
      let root: Root | null = createRoot(container)

      function render(p: P) {
        root?.render(
          createElement(ScopeProvider, { scope: ctx.scope, children:
            createElement(component as ComponentType<Record<string, unknown>>, p),
          }),
        )
      }

      const { result: currentProps, controllers } = track(props)
      render(currentProps)

      const binding: ReactiveBinding = {
        fn: props,
        prev: currentProps,
        update(nextProps: unknown) {
          render(nextProps as P)
        },
        alive: true,
        unsubs: [],
      }
      ctx.reactiveBindings.push(binding)
      subscribeToControllers(binding, controllers)

      ctx.cleanups.push(() => {
        root?.unmount()
        root = null
      })
    },
  }
}
