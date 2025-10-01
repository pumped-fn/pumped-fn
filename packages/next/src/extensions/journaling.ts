import type { Extension, Accessor, Core } from "../types";

interface JournalEntry {
  key: string;
  value: unknown;
  timestamp: number;
  flowName: string;
  depth: number;
}

export const createJournalingExtension = (
  storage?: Map<string, JournalEntry>
): Extension.Extension => {
  const journal = storage || new Map<string, JournalEntry>();

  return {
    name: "journaling",

    initPod(pod: Core.Pod, context: Accessor.DataStore) {
      const journalKey = Symbol("journal");
      context.set(journalKey, journal);
    },

    async wrapExecute<T>(
      context: Accessor.DataStore,
      next: () => Promise<T>,
      execution: Extension.ExecutionContext
    ): Promise<T> {
      const journalKey = `${execution.flowName}:${execution.depth}:${Date.now()}`;

      const existing = journal.get(journalKey);
      if (existing) {
        return existing.value as T;
      }

      try {
        const result = await next();

        journal.set(journalKey, {
          key: journalKey,
          value: result,
          timestamp: Date.now(),
          flowName: execution.flowName || 'unknown',
          depth: execution.depth,
        });

        return result;
      } catch (error) {
        journal.set(journalKey, {
          key: journalKey,
          value: { __error: true, error },
          timestamp: Date.now(),
          flowName: execution.flowName || 'unknown',
          depth: execution.depth,
        });

        throw error;
      }
    },

    disposePod(pod: Core.Pod) {
    }
  };
};

export const getJournalEntries = (journal: Map<string, JournalEntry>): JournalEntry[] => {
  return Array.from(journal.values());
};

export const clearJournal = (journal: Map<string, JournalEntry>): void => {
  journal.clear();
};
