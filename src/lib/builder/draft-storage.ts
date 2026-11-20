export const BUILDER_DRAFT_STORAGE_PREFIX =
  "ornigami.builder.offer-intake.brief.v1";

export type BuilderDraftStorage = {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

/**
 * Removes every builder draft key and returns the count removed. Callers use
 * this only after the server confirms logout (or reports the session already
 * inactive), then pause further draft persistence until navigation.
 */
export function clearBuilderDraftStorage(
  storage: BuilderDraftStorage,
): number {
  let removed = 0;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(BUILDER_DRAFT_STORAGE_PREFIX)) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}
