import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { tags } from "../src/tag-executors";

describe("Tag Scope Resolution", () => {
  test("scope resolves raw tag with default using readFrom", async () => {
    const roleTag = tag(custom<string>(), { label: "role", default: "user" });
    const scope = createScope({ tags: [roleTag("admin")] });

    const result = await (scope as any).resolveTag(roleTag);
    expect(result).toBe("admin");
  });

  test("scope resolves raw tag without default using extractFrom", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("123")] });

    const result = await (scope as any).resolveTag(userIdTag);
    expect(result).toBe("123");
  });

  test("scope resolves tag executor with required mode", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("123")] });
    const tagExec = tags.required(userIdTag);

    const result = await (scope as any).resolveTagExecutor(tagExec);
    expect(result).toBe("123");
  });

  test("scope resolves tag executor with optional mode", async () => {
    const roleTag = tag(custom<string>(), { label: "role", default: "user" });
    const scope = createScope({ tags: [] });
    const tagExec = tags.optional(roleTag);

    const result = await (scope as any).resolveTagExecutor(tagExec);
    expect(result).toBe("user");
  });

  test("scope resolves tag executor with all mode", async () => {
    const permTag = tag(custom<string>(), { label: "permission" });
    const scope = createScope({
      tags: [permTag("read"), permTag("write"), permTag("delete")]
    });
    const tagExec = tags.all(permTag);

    const result = await (scope as any).resolveTagExecutor(tagExec);
    expect(result).toEqual(["read", "write", "delete"]);
  });

  test("tag without default throws when missing", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [] });

    expect(() => (scope as any).resolveTag(userIdTag)).toThrow();
  });
});
