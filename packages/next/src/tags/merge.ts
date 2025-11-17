import { type Tag } from "../tag-types";

export const mergeFlowTags = (
  definitionTags?: ReadonlyArray<Tag.Tagged | undefined>,
  executionTags?: ReadonlyArray<Tag.Tagged | undefined>
): Tag.Tagged[] | undefined => {
  const hasDefinition = !!definitionTags && definitionTags.length > 0;
  const hasExecution = !!executionTags && executionTags.length > 0;

  if (!hasDefinition && !hasExecution) {
    return undefined;
  }

  const merged: Tag.Tagged[] = [];

  if (definitionTags) {
    for (const tag of definitionTags) {
      if (tag) {
        merged.push(tag);
      }
    }
  }

  if (executionTags) {
    for (const tag of executionTags) {
      if (tag) {
        merged.push(tag);
      }
    }
  }

  return merged.length > 0 ? merged : undefined;
};
