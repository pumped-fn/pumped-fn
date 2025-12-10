import { createScope, atom } from "@pumped-fn/lite";
import type { Devtools } from "@pumped-fn/lite-devtools";

export const eventsAtom = atom<Devtools.Event[]>({ factory: () => [] });
export const scope = createScope();
