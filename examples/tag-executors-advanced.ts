import { tag, derive, createScope, custom, tags } from "@pumped-fn/core-next";

const permissionTag = tag(custom<string>(), { label: "permission" });
const featureFlagTag = tag(custom<string>(), { label: "feature" });
const timeoutTag = tag(custom<number>(), { label: "timeout", default: 5000 });

const serviceExecutor = derive(
  [
    tags.all(permissionTag),
    tags.all(featureFlagTag),
    tags.optional(timeoutTag),
  ],
  ([permissions, features, timeout]) => {
    return {
      permissions,
      features,
      timeout,
    };
  }
);

const scope = createScope({
  tags: [
    permissionTag("read"),
    permissionTag("write"),
    featureFlagTag("new-ui"),
    timeoutTag(3000),
  ],
});

const result = await scope.resolve(serviceExecutor);
console.log(result);
