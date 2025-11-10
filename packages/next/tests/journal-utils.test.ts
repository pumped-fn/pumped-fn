import { describe, test, expect } from "vitest";
import { createJournalKey, checkJournalReplay, isErrorEntry } from "../src/internal/journal-utils";

describe("journal-utils", () => {
  test("createJournalKey generates key with flow:depth:key format", () => {
    const key = createJournalKey("myFlow", 2, "action");
    expect(key).toBe("myFlow:2:action");
  });

  test("isErrorEntry identifies error entries", () => {
    expect(isErrorEntry({ __error: true, error: new Error("test") })).toBe(true);
    expect(isErrorEntry({ value: 42 })).toBe(false);
    expect(isErrorEntry(null)).toBe(false);
    expect(isErrorEntry(undefined)).toBe(false);
  });

  test("checkJournalReplay returns value if no entry", () => {
    const journal = new Map();
    const result = checkJournalReplay(journal, "key:0:test");

    expect(result).toEqual({ isReplay: false, value: undefined });
  });

  test("checkJournalReplay returns value if entry exists", () => {
    const journal = new Map();
    journal.set("key:0:test", 42);

    const result = checkJournalReplay(journal, "key:0:test");

    expect(result).toEqual({ isReplay: true, value: 42 });
  });

  test("checkJournalReplay throws if error entry", () => {
    const journal = new Map();
    const error = new Error("test error");
    journal.set("key:0:test", { __error: true, error });

    expect(() => checkJournalReplay(journal, "key:0:test")).toThrow("test error");
  });
});
