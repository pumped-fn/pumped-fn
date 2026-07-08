import type { Node } from "./index"

export { Fragment, jsx, jsxs } from "./index"

export namespace JSX {
  export type Element = Node

  export interface ElementChildrenAttribute {
    children: {}
  }

  export interface IntrinsicElements {}
}
