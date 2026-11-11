import {
  DEFAULT_BASEMAP_ID,
  parseThemeChoice,
  type Settings,
  type SettingsStore,
  THEME_STORAGE_KEY,
  type UnitSystem,
  type ViewState,
} from "@mapcairn/core";

/** The settings a store starts from, and falls back to for a bad stored value. */
const DEFAULTS: Settings = Object.freeze({
  theme: "system",
  units: "metric",
  zoomButtons: null,
  saveData: null,
  basemapId: DEFAULT_BASEMAP_ID,
  lastView: null,
});

const KEY_PREFIX = "mapcairn:";
const PROBE_KEY = `${KEY_PREFIX}probe`;
const BASEMAP_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_ZOOM = 24;

type SettingName = keyof Settings;

const SETTING_NAMES: readonly SettingName[] = [
  "theme",
  "units",
  "zoomButtons",
  "saveData",
  "basemapId",
  "lastView",
];

/** The storage key for a setting. Theme is the one key shared with the pre-paint script. */
function storageKey(name: SettingName): string {
  return name === "theme" ? THEME_STORAGE_KEY : `${KEY_PREFIX}${name}`;
}

function parseUnits(raw: unknown): UnitSystem {
  return raw === "imperial" ? "imperial" : DEFAULTS.units;
}

/** An explicit choice is a boolean; anything else means "follow the device". */
function parseOptionalBoolean(raw: unknown): boolean | null {
  return typeof raw === "boolean" ? raw : null;
}

function parseBasemapId(raw: unknown): string {
  return typeof raw === "string" && BASEMAP_ID_PATTERN.test(raw)
    ? raw
    : DEFAULTS.basemapId;
}

function isNumberInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && value >= min && value <= max;
}

function parseLastView(raw: unknown): ViewState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { center, zoom, bearing } = raw as Record<string, unknown>;
  if (typeof center !== "object" || center === null) {
    return null;
  }
  const { lat, lng } = center as Record<string, unknown>;
  if (
    !isNumberInRange(lat, -90, 90) ||
    !isNumberInRange(lng, -180, 180) ||
    !isNumberInRange(zoom, 0, MAX_ZOOM) ||
    !Number.isFinite(bearing)
  ) {
    return null;
  }
  return {
    center: { lat: lat as number, lng: lng as number },
    zoom: zoom as number,
    bearing: bearing as number,
  };
}

function viewsEqual(a: ViewState | null, b: ViewState | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.center.lat === b.center.lat &&
    a.center.lng === b.center.lng &&
    a.zoom === b.zoom &&
    a.bearing === b.bearing
  );
}

function settingEqual(
  name: SettingName,
  a: Settings[SettingName],
  b: Settings[SettingName],
): boolean {
  return name === "lastView"
    ? viewsEqual(a as ViewState | null, b as ViewState | null)
    : Object.is(a, b);
}

function parseJson(raw: string | null): unknown {
  if (raw === null) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Reads one stored value as a setting, or its default when it is absent or invalid. */
function parseSetting(
  name: SettingName,
  raw: string | null,
): Settings[SettingName] {
  switch (name) {
    case "theme":
      return parseThemeChoice(raw);
    case "units":
      return parseUnits(parseJson(raw));
    case "zoomButtons":
      return parseOptionalBoolean(parseJson(raw));
    case "saveData":
      return parseOptionalBoolean(parseJson(raw));
    case "basemapId":
      return parseBasemapId(parseJson(raw));
    case "lastView":
      return parseLastView(parseJson(raw));
  }
}

/** The theme is a plain string so the inline script can read it; the rest are JSON. */
function serialiseSetting(
  name: SettingName,
  value: Settings[SettingName],
): string {
  return name === "theme" ? String(value) : JSON.stringify(value);
}

function defaultStorage(): Storage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** The part of `window` the store listens to for changes made in other tabs. */
export interface StorageEventTarget {
  addEventListener(type: "storage", listener: (event: Event) => void): void;
  removeEventListener(type: "storage", listener: (event: Event) => void): void;
}

/** Options for {@link LocalStorageSettingsStore}. */
export interface LocalStorageSettingsStoreOptions {
  /**
   * Returns the storage to use. Called on every access, because merely
   * reading `window.localStorage` throws in Safari when site data is blocked.
   * Defaults to `globalThis.localStorage`.
   */
  readonly getStorage?: () => Storage | undefined;
  /**
   * Where `storage` events arrive from. Defaults to `window`; pass
   * `undefined` to listen to nothing.
   */
  readonly events?: StorageEventTarget | undefined;
}

/**
 * A {@link SettingsStore} over `localStorage` that never throws.
 *
 * @remarks Each setting lives under its own key, `mapcairn:<name>`, as JSON. The
 *   exception is the theme, stored as a plain string under
 *   {@link THEME_STORAGE_KEY} so the inline pre-paint script can read it
 *   without parsing. Stored values are validated on read: anything invalid
 *   becomes the default for that setting.
 *
 *   Every storage access is guarded. The values are held in memory as well, so
 *   when storage is blocked (Safari private mode, a "block all cookies"
 *   setting, a full quota, or no `window` while rendering on the server) the
 *   store keeps working for the life of the page and `persistent` is false.
 *   A write that fails later flips `persistent` to false too.
 *
 *   While there is at least one subscriber, the store listens for `storage`
 *   events and adopts changes made in other tabs. It stops listening when the
 *   last subscriber leaves.
 */
export class LocalStorageSettingsStore implements SettingsStore {
  readonly #getStorage: () => Storage | undefined;
  readonly #events: StorageEventTarget | undefined;
  readonly #listeners = new Set<(settings: Settings) => void>();
  #settings: Settings;
  #persistent: boolean;

  constructor(options: LocalStorageSettingsStoreOptions = {}) {
    this.#getStorage = options.getStorage ?? defaultStorage;
    if ("events" in options) {
      this.#events = options.events;
    } else {
      this.#events = typeof window === "undefined" ? undefined : window;
    }
    this.#persistent = this.#probe();
    this.#settings = this.#readAll(DEFAULTS);
  }

  /** False when changes will be lost on reload. */
  get persistent(): boolean {
    return this.#persistent;
  }

  get(): Settings {
    return this.#settings;
  }

  set(patch: Partial<Settings>): void {
    let next = this.#settings;
    const changed: SettingName[] = [];
    for (const name of SETTING_NAMES) {
      const value = patch[name];
      if (value !== undefined && !settingEqual(name, value, next[name])) {
        next = { ...next, [name]: value };
        changed.push(name);
      }
    }
    if (changed.length === 0) {
      return;
    }
    this.#settings = Object.freeze(next);
    for (const name of changed) {
      this.#write(name, next[name]);
    }
    this.#notify();
  }

  subscribe(listener: (settings: Settings) => void): () => void {
    const entry = (settings: Settings) => listener(settings);
    this.#listeners.add(entry);
    if (this.#listeners.size === 1) {
      this.#events?.addEventListener("storage", this.#onStorage);
    }
    return () => {
      if (!this.#listeners.delete(entry)) {
        return;
      }
      if (this.#listeners.size === 0) {
        this.#events?.removeEventListener("storage", this.#onStorage);
      }
    };
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) {
      listener(this.#settings);
    }
  }

  /** The storage, or undefined when it is missing or its getter throws. */
  #storage(): Storage | undefined {
    try {
      return this.#getStorage() ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** Writes, reads back and removes a probe key, so a quota or privacy block shows up now. */
  #probe(): boolean {
    try {
      const storage = this.#storage();
      if (storage === undefined) {
        return false;
      }
      storage.setItem(PROBE_KEY, "1");
      const readBack = storage.getItem(PROBE_KEY);
      storage.removeItem(PROBE_KEY);
      return readBack === "1";
    } catch {
      return false;
    }
  }

  #write(name: SettingName, value: Settings[SettingName]): void {
    if (!this.#persistent) {
      return;
    }
    try {
      const storage = this.#storage();
      if (storage === undefined) {
        this.#persistent = false;
        return;
      }
      storage.setItem(storageKey(name), serialiseSetting(name, value));
    } catch {
      this.#persistent = false;
    }
  }

  /**
   * Reads every setting. A key that is absent or invalid becomes its default;
   * a key that cannot be read at all keeps its `fallback` value. Reads are
   * attempted even when the write probe failed, because some browsers block
   * only writes.
   */
  #readAll(fallback: Settings): Settings {
    const storage = this.#storage();
    let result: Settings = fallback;
    if (storage === undefined) {
      return Object.freeze({ ...result });
    }
    for (const name of SETTING_NAMES) {
      try {
        result = {
          ...result,
          [name]: parseSetting(name, storage.getItem(storageKey(name))),
        };
      } catch {
        // Keep the fallback value for a key that cannot be read.
      }
    }
    return Object.freeze(result);
  }

  readonly #onStorage = (event: Event): void => {
    const { key, storageArea } = event as Event & {
      key?: string | null;
      storageArea?: Storage | null;
    };
    const isOurs = SETTING_NAMES.some((name) => storageKey(name) === key);
    const isClear = key === null || key === undefined;
    if (!(isOurs || isClear)) {
      return;
    }
    if (storageArea && storageArea !== this.#storage()) {
      return;
    }
    const next = this.#readAll(this.#settings);
    const differs = SETTING_NAMES.some(
      (name) => !settingEqual(name, next[name], this.#settings[name]),
    );
    if (differs) {
      this.#settings = next;
      this.#notify();
    }
  };
}
