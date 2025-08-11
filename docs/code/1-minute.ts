import { provide, derive, createScope } from "@pumped-fn/core-next";

/**
 * A very simple example.
 *
 * We have value containers
 * ... we have scope
 * ... and magic happens just a little bit way too quick
 */

const value = provide(() => 1);
const derived = derive(value, (value) => value + 1);

const scope = createScope();

const resolvedDerived = await scope.resolve(derived);
console.log(resolvedDerived); // 2

await scope.dispose(); // Cleanup resources, release memory
