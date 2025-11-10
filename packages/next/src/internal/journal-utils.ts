export type JournalEntry<T = unknown> = T | { __error: true; error: unknown };

export function createJournalKey(flowName: string, depth: number, key: string): string {
  return `${flowName}:${depth}:${key}`;
}

export function isErrorEntry<T>(entry: JournalEntry<T>): entry is { __error: true; error: unknown } {
  return typeof entry === "object" && entry !== null && "__error" in entry && entry.__error === true;
}

export function checkJournalReplay<T>(
  journal: Map<string, JournalEntry<T>>,
  journalKey: string
): { isReplay: boolean; value: T | undefined } {
  if (!journal.has(journalKey)) {
    return { isReplay: false, value: undefined };
  }

  const entry = journal.get(journalKey);

  if (isErrorEntry(entry)) {
    throw entry.error;
  }

  return { isReplay: true, value: entry };
}
