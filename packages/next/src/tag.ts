import { type StandardSchemaV1 } from "./types";
import { type Tag } from "./tag-types";

export function tag<T>(schema: StandardSchemaV1<T>): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options: { label?: string; default: T }
): Tag.Tag<T, true>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string }
): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string; default?: T }
): Tag.Tag<T, boolean> {
  throw new Error("Not implemented");
}
