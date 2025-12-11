export type { OtelExtension } from "./types";
export { createOtel } from "./extension";
export { SPAN_KEY, getSpanFromContext } from "./span";
export { extractContext, injectContext, getCurrentSpan } from "./propagation";
