import { describe, it, expectTypeOf } from "vitest";
import type { OtelExtension } from "../src";
import type { Tracer, Meter } from "@opentelemetry/api";
import type { Lite } from "@pumped-fn/lite";

describe("OtelExtension types", () => {
  it("OtelOptions accepts tracer", () => {
    expectTypeOf<OtelExtension.Options>().toMatchTypeOf<{
      tracer: Tracer;
      meter?: Meter;
    }>();
  });

  it("createOtel returns Extension", () => {
    expectTypeOf<typeof import("../src").createOtel>().returns.toMatchTypeOf<Lite.Extension>();
  });
});
