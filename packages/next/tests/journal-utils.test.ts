import { describe, test, expect } from "vitest";
import { createJournalKey, checkJournalReplay, isErrorEntry } from "../src/internal/journal-utils";

describe("journal-utils", () => {
  test.each([
    { flow: "myFlow", depth: 2, key: "action", expected: "myFlow:2:action" },
    { flow: "test", depth: 0, key: "init", expected: "test:0:init" },
    { flow: "nested", depth: 5, key: "op", expected: "nested:5:op" },
  ])("createJournalKey($flow, $depth, $key) = $expected", ({ flow, depth, key, expected }) => {
    expect(createJournalKey(flow, depth, key)).toBe(expected);
  });

  test.each([
    { entry: { __error: true, error: new Error("test") }, expected: true, desc: "error entry" },
    { entry: { value: 42 }, expected: false, desc: "value entry" },
    { entry: null, expected: false, desc: "null" },
    { entry: undefined, expected: false, desc: "undefined" },
  ])("isErrorEntry($desc) = $expected", ({ entry, expected }) => {
    expect(isErrorEntry(entry)).toBe(expected);
  });

  test.each([
    { desc: "no entry", journal: new Map(), key: "key:0:test", expected: { isReplay: false, value: undefined } },
    { desc: "existing entry", journal: new Map([["key:0:test", 42]]), key: "key:0:test", expected: { isReplay: true, value: 42 } },
  ])("checkJournalReplay $desc", ({ journal, key, expected }) => {
    expect(checkJournalReplay(journal, key)).toEqual(expected);
  });

  test("checkJournalReplay throws on error entry", () => {
    const journal = new Map();
    const error = new Error("test error");
    journal.set("key:0:test", { __error: true, error });
    expect(() => checkJournalReplay(journal, "key:0:test")).toThrow("test error");
  });
});
