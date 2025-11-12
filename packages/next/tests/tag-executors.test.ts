import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { tags, isTag, isTagExecutor } from "../src/tag-executors";
import { tagSymbol } from "../src/tag-types";

describe("Tag Executor Helpers", () => {
  test("tags.required creates TagExecutor with extract mode", () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const tagExec = tags.required(userIdTag);

    expect(tagExec[tagSymbol]).toBe("required");
    expect(tagExec.tag).toBe(userIdTag);
    expect(tagExec.extractionMode).toBe("extract");
  });

  test("tags.optional creates TagExecutor with read mode", () => {
    const roleTag = tag(custom<string>(), { label: "role" });
    const tagExec = tags.optional(roleTag);

    expect(tagExec[tagSymbol]).toBe("optional");
    expect(tagExec.tag).toBe(roleTag);
    expect(tagExec.extractionMode).toBe("read");
  });

  test("tags.all creates TagExecutor with collect mode", () => {
    const permTag = tag(custom<string>(), { label: "permission" });
    const tagExec = tags.all(permTag);

    expect(tagExec[tagSymbol]).toBe("all");
    expect(tagExec.tag).toBe(permTag);
    expect(tagExec.extractionMode).toBe("collect");
  });
});

describe("Tag Type Guards", () => {
  test("isTag detects raw tags", () => {
    const userIdTag = tag(custom<string>());
    expect(isTag(userIdTag)).toBe(true);
    expect(isTag({})).toBe(false);
    expect(isTag(null)).toBe(false);
  });

  test("isTagExecutor detects tag executors", () => {
    const userIdTag = tag(custom<string>());
    const tagExec = tags.required(userIdTag);

    expect(isTagExecutor(tagExec)).toBe(true);
    expect(isTagExecutor(userIdTag)).toBe(false);
    expect(isTagExecutor({})).toBe(false);
  });
});
