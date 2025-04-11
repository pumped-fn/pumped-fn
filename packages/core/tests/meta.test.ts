import { any } from "../src";
import { findValue, meta } from "../src/meta";
import { vi, test } from "vitest";

test("meta should work", () => {
  const http = meta(Symbol(), any<{ hello: string; number?: number }>());
  const defaultHttp = http.partial({ number: 1 });

  const defaultValue = { hello: "world", number: 1 } as const;

  const values = [http({ hello: "everything" })];

  const mergedValue = Object.assign({}, defaultHttp, http.find(values));
});
