import { tag, provide, derive, createScope, custom } from "@pumped-fn/core-next";

const userIdTag = tag(custom<string>(), { label: "userId" });
const roleTag = tag(custom<string>(), { label: "role", default: "user" });

const dbExecutor = provide(() => ({
  findUser: (id: string) => ({ id, name: "John" }),
}));

const userRepoExecutor = derive([dbExecutor, userIdTag, roleTag], ([db, userId, role]) => {
  const user = db.findUser(userId);
  return {
    ...user,
    role,
  };
});

const scope = createScope({
  tags: [userIdTag("user123"), roleTag("admin")],
});

const result = await scope.resolve(userRepoExecutor);
console.log(result);
