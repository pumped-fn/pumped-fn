import { createScope, custom, tag } from "../src";

import { describe, it, expect } from "vitest";

describe("tag", () => {
  it("should create a tag", () => {
    const value = tag(custom<string>());

    const scope = createScope({
      tags: [value("hello")],
    });

    expect(value.readFrom(scope)).toBe("hello");
  });
});
