import { Core, Meta } from "./types"
import { meta } from "./meta"
import { custom } from "./ssch"

export const eager: {
  meta: Meta.MetaFn<boolean>;
  plugin: () => Core.Plugin;
} = {
  meta: meta(Symbol.for('@pumped-fn/plugin/eager'), custom<boolean>()),
  plugin: (): Core.Plugin => ({
    init(scope, { registry }) {

      for (const executor of registry) {
        const isEager = eager.meta.find(executor);
        if (isEager) {
          scope.resolve(executor)
        }
      }
    },
  })
}
