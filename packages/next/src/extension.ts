import { type Extension } from "./types";

/**
 * Type helper for defining extensions (no-op at runtime).
 * @param ext - Extension object with init/wrap/onError/dispose hooks
 * @example extension({ name: "logger", wrap: (scope, next, op) => next() })
 */
export function extension<T extends Extension.Extension>(ext: T): T {
  return ext;
}
