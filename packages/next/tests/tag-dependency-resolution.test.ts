import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { provide, derive } from "../src/executor";
import { createScope } from "../src/scope";
import { tags } from "../src/tag-executors";

describe("Tag Dependency Resolution", () => {
  test("derive resolves raw tag in dependencies", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("user123")] });

    const executor = derive([userIdTag], ([userId]) => {
      return `Hello ${userId}`;
    });

    const result = await scope.resolve(executor);
    expect(result).toBe("Hello user123");
  });

  test("derive resolves tag executor in dependencies", async () => {
    const permTag = tag(custom<string>(), { label: "permission" });
    const scope = createScope({
      tags: [permTag("read"), permTag("write")]
    });

    const executor = derive([tags.all(permTag)], ([permissions]) => {
      return permissions.join(",");
    });

    const result = await scope.resolve(executor);
    expect(result).toBe("read,write");
  });

  test("derive resolves mixed executor and tag dependencies", async () => {
    const dbExecutor = provide(() => ({ query: () => "data" }));
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("user123")] });

    const executor = derive([dbExecutor, userIdTag], ([db, userId]) => {
      return `${db.query()} for ${userId}`;
    });

    const result = await scope.resolve(executor);
    expect(result).toBe("data for user123");
  });

  test("derive resolves tag array dependencies", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const roleTag = tag(custom<string>(), { label: "role", default: "user" });
    const scope = createScope({ tags: [userIdTag("123")] });

    const executor = derive([userIdTag, roleTag], ([userId, role]) => {
      return { userId, role };
    });

    const result = await scope.resolve(executor);
    expect(result).toEqual({ userId: "123", role: "user" });
  });

  test("derive resolves tag record dependencies", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const roleTag = tag(custom<string>(), { label: "role" });
    const scope = createScope({
      tags: [userIdTag("123"), roleTag("admin")]
    });

    const executor = derive(
      { user: userIdTag, role: roleTag },
      ({ user, role }) => {
        return `${user}:${role}`;
      }
    );

    const result = await scope.resolve(executor);
    expect(result).toBe("123:admin");
  });
});
