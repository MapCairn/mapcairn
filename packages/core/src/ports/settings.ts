// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ViewState } from "./geometry";
import type { MapProjection } from "./map";

/** The theme the user chose. "system" follows the operating system. */
export type ThemeChoice = "system" | "light" | "dark";

/** The theme actually shown. */
export type ResolvedTheme = "light" | "dark";

/** Measurement units. */
export type UnitSystem = "metric" | "imperial";

/** Everything the app remembers between visits. */
export interface Settings {
  /** The theme the person chose. */
  readonly theme: ThemeChoice;
  /** Whether distances are shown in metric or imperial units. */
  readonly units: UnitSystem;
  /**
   * Whether to show zoom buttons. `null` means "use the device default":
   * on for fine pointers, off for touch. An explicit `true` shows them on
   * every device and never hides them.
   */
  readonly zoomButtons: boolean | null;
  /**
   * Whether to spend less data: no basemap thumbnails and, where a basemap
   * offers it, fewer layers. `null` means "follow the device": on when the
   * browser reports a save-data request or a very slow connection, off
   * otherwise. An explicit `true` or `false` always wins over that signal.
   */
  readonly saveData: boolean | null;
  /** The shape of the map: `"flat"` (the default) or `"globe"`. */
  readonly projection: MapProjection;
  /**
   * The id of the basemap the person chose, or `null` when they never have.
   * With `null` the basemap is the host's default for the theme shown (see
   * `BasemapCatalogue`), and it changes when the theme does. A chosen id is
   * kept across theme changes and reloads. Nothing writes an id until a
   * person picks a basemap, so a stored id, even the default's, is a choice.
   * A shared link's basemap is not stored here.
   */
  readonly basemapId: string | null;
  /** The view the map had when it was last left, or `null` when there is none. */
  readonly lastView: ViewState | null;
  /**
   * The version of the first-visit tour the person has answered (taken,
   * skipped, or made unnecessary by turning a layer on), or `null` for a new
   * visitor. A host that bumps its tour version offers the tour once more.
   */
  readonly tourSeen: number | null;
  /**
   * The BCP 47 tag of the language the person chose (for example `"af"`), or
   * `null` to follow the browser's languages. A tag the host does not offer
   * is ignored when the language is resolved. It lives on the device and is
   * not part of a shared link.
   */
  readonly language: string | null;
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
  /** Merges the patch into the settings. A property whose value is `undefined` is ignored, and a change that alters nothing notifies nobody. */
  set(patch: Partial<Settings>): void;
  /** Calls the listener after a change. Returns the function that unsubscribes. */
  subscribe(listener: (settings: Settings) => void): () => void;
}
