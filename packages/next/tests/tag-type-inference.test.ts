import { describe, test, expectTypeOf } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { tags } from "../src/tag-executors";
import { type Core } from "../src/types";

describe("Tag Type Inference", () => {
  test("InferOutput extracts tag value type", () => {
    const userIdTag = tag(custom<string>());
    type Result = Core.InferOutput<typeof userIdTag>;
    expectTypeOf<Result>().toEqualTypeOf<string>();
  });

  test("InferOutput extracts TagExecutor value type", () => {
    const userIdTag = tag(custom<string>());
    const tagExec = tags.required(userIdTag);
    type Result = Core.InferOutput<typeof tagExec>;
    expectTypeOf<Result>().toEqualTypeOf<string>();
  });

  test("InferOutput extracts array type from tags.all", () => {
    const permTag = tag(custom<string>());
    const tagExec = tags.all(permTag);
    type Result = Core.InferOutput<typeof tagExec>;
    expectTypeOf<Result>().toEqualTypeOf<string[]>();
  });

  test("InferOutput works with mixed dependencies", () => {
    const userIdTag = tag(custom<string>());
    const roleTag = tag(custom<string>());

    type Deps = [typeof userIdTag, typeof roleTag];
    type Result = Core.InferOutput<Deps>;
    expectTypeOf<Result>().toEqualTypeOf<[string, string]>();
  });
});
