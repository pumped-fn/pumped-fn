import { describe, it, expect } from "vitest";
import { flow, isFlow } from "../src/flow";
import { atom } from "../src/atom";
import { tag, tags } from "../src/tag";

describe("Flow", () => {
  describe("flow()", () => {
    it("preserves all config properties", () => {
      const dbAtom = atom({ factory: () => ({ query: () => [] }) });
      const requestId = tag<string>({ label: "requestId" });
      const parse = (raw: unknown): string => String(raw);

      const myFlow = flow({
        name: "myFlow",
        parse,
        deps: { db: dbAtom, reqId: tags.required(requestId) },
        factory: (ctx, { db }) => db.query(),
      });

      expect(isFlow(myFlow)).toBe(true);
      expect(myFlow.name).toBe("myFlow");
      expect(myFlow.parse).toBe(parse);
      expect(myFlow.deps).toHaveProperty("db");
      expect(myFlow.deps).toHaveProperty("reqId");
    });
  });
});
