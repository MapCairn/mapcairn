/** Starts every settings key an earlier version stored, before the rename from Karta. */
export const LEGACY_KEY_PREFIX = "karta:";

/** One stored value that moved: the key it had and the key it has now. */
export interface KeyMigration {
  readonly legacyKey: string;
  readonly key: string;
}

/**
 * Pairs each setting's current key with the key it had before the rename.
 *
 * @param names The setting names.
 * @param keyFor The current storage key for a setting name.
 */
export function legacySettingKeys(
  names: readonly string[],
  keyFor: (name: string) => string,
): KeyMigration[] {
  return names.map((name) => ({
    legacyKey: `${LEGACY_KEY_PREFIX}${name}`,
    key: keyFor(name),
  }));
}

/**
 * Moves values stored under earlier keys to their current keys, once.
 *
 * @remarks A value is copied only when the current key is empty, so a choice
 *   made since the rename wins. The earlier key is then removed, which is what
 *   makes a second run do nothing. If the copy cannot be written the earlier
 *   key stays, so a later visit tries again. Each pair is guarded on its own
 *   and the function never throws, because storage can be blocked, full or
 *   read-only.
 */
export function migrateLegacyStorage(
  storage: Storage,
  migrations: readonly KeyMigration[],
): void {
  for (const { legacyKey, key } of migrations) {
    try {
      const legacy = storage.getItem(legacyKey);
      if (legacy === null) {
        continue;
      }
      if (storage.getItem(key) === null) {
        storage.setItem(key, legacy);
      }
      storage.removeItem(legacyKey);
    } catch {
      // Leave this pair for the next visit.
    }
  }
}
