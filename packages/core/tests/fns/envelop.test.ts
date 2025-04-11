import { it, expect, describe, test } from "vitest";
import { resolve, resolveOnce } from "../../src/statics";
import { createScope, ScopeInner } from "../../src/core";
import { findValue, meta } from "../../src/meta";
import { any } from "../../src/standardschema";
import { provide } from "../../src/fns/immutable";

test("envelop test", async () => {
  const scope = createScope();

  const http = meta("http", any<string>());

  const value = provide(() => {}, http("1234"));

  const value2 = provide(value.envelop, (resolved) => {
    return findValue(resolved, http);
  });

  const resolved = await scope.resolve(value2);

  expect(resolved.get()).toBe("1234");
});
