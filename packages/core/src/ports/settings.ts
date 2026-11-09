import type { ViewState } from "./geometry";

/** The theme the user chose. "system" follows the operating system. */
export type ThemeChoice = "system" | "light" | "dark";

/** The theme actually shown. */
export type ResolvedTheme = "light" | "dark";

/** Measurement units. */
export type UnitSystem = "metric" | "imperial";

/** Everything the app remembers between visits. */
export interface Settings {
  readonly theme: ThemeChoice;
  readonly units: UnitSystem;
  /**
   * Whether to show zoom buttons. `null` means "use the device default":
   * on for fine pointers, off for touch. An explicit `true` shows them on
   * every device and never hides them.
   */
  readonly zoomButtons: boolean | null;
  readonly basemapId: string;
  readonly lastView: ViewState | null;
}

/**
 * Remembers settings. Implementations never throw, even when storage is
 * blocked; they fall back to memory and report `persistent: false` so the
 * ui can say changes will not be remembered.
 */
export interface SettingsStore {
  /** False when changes will be lost on reload. */
  readonly persistent: boolean;
  /** The current settings. The same object is returned until something changes. */
  get(): Settings;
  set(patch: Partial<Settings>): void;
  subscribe(listener: (settings: Settings) => void): () => void;
}
