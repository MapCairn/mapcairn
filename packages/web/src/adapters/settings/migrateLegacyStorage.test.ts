import { describe, expect, it } from "vitest";
import {
  LEGACY_KEY_PREFIX,
  legacySettingKeys,
  migrateLegacyStorage,
} from "./migrateLegacyStorage";

/** A Storage over a map that can be told to refuse writes or removals. */
class FakeStorage implements Storage {
  readonly items = new Map<string, string>();
  failWrites = false;
  failRemovals = false;

  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    if (this.failRemovals) {
      throw new DOMException("blocked", "SecurityError");
    }
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new DOMException("full", "QuotaExceededError");
    }
    this.items.set(key, value);
  }
}

const KEYS = [
  { legacyKey: "karta:theme", key: "mapcairn:theme" },
  { legacyKey: "karta:units", key: "mapcairn:units" },
  { legacyKey: "karta:lastView", key: "mapcairn:lastView" },
];

function seeded(seed: Record<string, string>): FakeStorage {
  const storage = new FakeStorage();
  for (const [key, value] of Object.entries(seed)) {
    storage.items.set(key, value);
  }
  return storage;
}

function contents(storage: FakeStorage): Record<string, string> {
  return Object.fromEntries(storage.items);
}

describe("migrateLegacyStorage", () => {
  it("copies each earlier key to its current key and removes the earlier one", () => {
    const storage = seeded({
      "karta:theme": "dark",
      "karta:units": '"imperial"',
      "karta:lastView": '{"zoom":3}',
    });
    migrateLegacyStorage(storage, KEYS);
    expect(contents(storage)).toEqual({
      "mapcairn:theme": "dark",
      "mapcairn:units": '"imperial"',
      "mapcairn:lastView": '{"zoom":3}',
    });
  });

  it("leaves current keys alone when no earlier key exists", () => {
    const storage = seeded({ "mapcairn:units": '"imperial"' });
    migrateLegacyStorage(storage, KEYS);
    expect(contents(storage)).toEqual({ "mapcairn:units": '"imperial"' });
  });

  it("keeps the current value when both keys exist, and still removes the earlier key", () => {
    const storage = seeded({
      "karta:theme": "dark",
      "mapcairn:theme": "light",
    });
    migrateLegacyStorage(storage, KEYS);
    expect(contents(storage)).toEqual({ "mapcairn:theme": "light" });
  });

  it("does nothing on an empty storage", () => {
    const storage = new FakeStorage();
    migrateLegacyStorage(storage, KEYS);
    expect(contents(storage)).toEqual({});
  });

  it("is idempotent", () => {
    const storage = seeded({
      "karta:theme": "dark",
      "karta:units": '"imperial"',
    });
    migrateLegacyStorage(storage, KEYS);
    const once = contents(storage);
    migrateLegacyStorage(storage, KEYS);
    expect(contents(storage)).toEqual(once);
  });

  it("does not touch keys it was not asked about", () => {
    const storage = seeded({ "karta:other": "x", unrelated: "y" });
    migrateLegacyStorage(storage, KEYS);
    expect(contents(storage)).toEqual({ "karta:other": "x", unrelated: "y" });
  });

  it("keeps the earlier key when the copy cannot be written, so a later visit can retry", () => {
    const storage = seeded({ "karta:theme": "dark" });
    storage.failWrites = true;
    expect(() => migrateLegacyStorage(storage, KEYS)).not.toThrow();
    expect(contents(storage)).toEqual({ "karta:theme": "dark" });
    storage.failWrites = false;
    migrateLegacyStorage(storage, KEYS);
    expect(contents(storage)).toEqual({ "mapcairn:theme": "dark" });
  });

  it("never throws when the earlier key cannot be removed, and the copy stands", () => {
    const storage = seeded({ "karta:theme": "dark" });
    storage.failRemovals = true;
    expect(() => migrateLegacyStorage(storage, KEYS)).not.toThrow();
    expect(storage.getItem("mapcairn:theme")).toBe("dark");
  });

  it("carries on with the other keys when one fails", () => {
    const storage = seeded({
      "karta:theme": "dark",
      "karta:units": '"imperial"',
    });
    const failing = new Proxy(storage, {
      get(target, property) {
        if (property === "getItem") {
          return (key: string) => {
            if (key === "karta:theme") {
              throw new DOMException("blocked", "SecurityError");
            }
            return target.getItem(key);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    expect(() => migrateLegacyStorage(failing, KEYS)).not.toThrow();
    expect(storage.getItem("mapcairn:units")).toBe('"imperial"');
  });
});

describe("legacySettingKeys", () => {
  it("pairs each current key with the key it had before the rename", () => {
    expect(
      legacySettingKeys(["theme", "units"], (name) => `mapcairn:${name}`),
    ).toEqual([
      { legacyKey: `${LEGACY_KEY_PREFIX}theme`, key: "mapcairn:theme" },
      { legacyKey: `${LEGACY_KEY_PREFIX}units`, key: "mapcairn:units" },
    ]);
  });
});
