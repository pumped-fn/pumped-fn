import { describe, test, expect } from "vitest";
import { tags } from "../src/index";
import { tag } from "../src/index";
import { custom } from "../src/index";

describe("Public Exports", () => {
  test("tags namespace is exported", () => {
    expect(tags).toBeDefined();
    expect(tags.required).toBeTypeOf("function");
    expect(tags.optional).toBeTypeOf("function");
    expect(tags.all).toBeTypeOf("function");
  });

  test("tags helpers work with exported tag function", () => {
    const userIdTag = tag(custom<string>());
    const tagExec = tags.required(userIdTag);

    expect(tagExec).toBeDefined();
  });
});
