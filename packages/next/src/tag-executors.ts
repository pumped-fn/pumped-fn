import { tagSymbol, type Tag } from "./tag-types";

export function required<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T, T> {
  return {
    [tagSymbol]: "required",
    tag,
    extractionMode: "extract",
  };
}

export function optional<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T, T> {
  return {
    [tagSymbol]: "optional",
    tag,
    extractionMode: "read",
  };
}

export function all<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T[], T> {
  return {
    [tagSymbol]: "all",
    tag,
    extractionMode: "collect",
  };
}

export const tags: {
  required: typeof required;
  optional: typeof optional;
  all: typeof all;
} = {
  required,
  optional,
  all,
};

export function isTag<T>(input: unknown): input is Tag.Tag<T, boolean> {
  return (
    typeof input === "function" &&
    "extractFrom" in input &&
    typeof input.extractFrom === "function" &&
    "readFrom" in input &&
    typeof input.readFrom === "function" &&
    "collectFrom" in input &&
    typeof input.collectFrom === "function"
  );
}

export function isTagExecutor<TOutput, TTag = TOutput>(input: unknown): input is Tag.TagExecutor<TOutput, TTag> {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    typeof input[tagSymbol] === "string" &&
    ["required", "optional", "all"].includes(input[tagSymbol])
  );
}
