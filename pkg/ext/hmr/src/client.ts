declare module "virtual:pumped-fn/lite-hmr" {
  export const meta: import("./types").HmrMeta
  export const modules: readonly import("./types").ModuleMeta[]
  export const handles: readonly import("./types").HandleMeta[]
  export const atoms: readonly import("./types").AtomMeta[]
  export const edges: readonly import("./types").EdgeMeta[]
  export const issues: readonly import("./types").IssueMeta[]
}
