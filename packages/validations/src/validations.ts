import type { StandardSchemaV1 } from "@pumped-fn/core";

export const v = {
  string: (): StandardSchemaV1<string, string> => ({
    "~standard": {
      version: 1,
      vendor: "@pumped-fn",
      validate: (value) => {
        if (typeof value === "string") {
          return { value };
        }
        return {
          issues: [{ message: "Expected a string." }],
        };
      },
    },
  }),
  literal: <S extends string>(literal: S): StandardSchemaV1<string, S> => ({
    "~standard": {
      version: 1,
      vendor: "@pumped-fn",
      validate: (value) => {
        if (value === literal) {
          return { value: value as S };
        }
        return {
          issues: [{ message: `Expected the literal "${literal}".` }],
        };
      },
    },
  }),
  union: <O>(...schemas: StandardSchemaV1<any, O>[]): StandardSchemaV1<O, O> => ({
    "~standard": {
      version: 1,
      vendor: "@pumped-fn",
      validate: async (value: unknown) => {
        const issues = [] as StandardSchemaV1.Issue[];
        for (const schema of schemas) {
          const result = await schema["~standard"].validate(value);

          if (result.issues) {
            issues.push(...result.issues);
          }
        }

        if (issues.length > 0) {
          return { issues };
        }

        return { value: value as O };
      },
    },
  }),
} satisfies Record<string, StandardSchemaV1 | ((...args: any[]) => StandardSchemaV1)>;
