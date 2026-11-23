// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** The device and accessibility preferences the interface adapts to. */
export interface DevicePreferencesValue {
  /** The user asked the system to reduce motion. */
  readonly reducedMotion: boolean;
  /** The primary input is a fine pointer that can hover, such as a mouse. */
  readonly finePointer: boolean;
  /**
   * The languages the browser prefers, as BCP 47 tags, most preferred first
   * (`navigator.languages`). Empty where there is none, as on the server. The
   * language setting follows them while the person has made no choice.
   */
  readonly languages: readonly string[];
  /**
   * Whether the browser says the device has a connection. A hint only: a
   * device can report online with no route, and no request is made to check.
   * Undefined, and so treated as online, where an adapter has no signal (the
   * server, or a host that does not report it), so read it as
   * `online !== false`.
   */
  readonly online?: boolean;
}

/**
 * Reports device and accessibility preferences, and tells the ui when they
 * change. Separate from {@link ThemeSource} because these never touch the
 * document; they only steer behaviour such as animation and default controls.
 */
export interface DevicePreferences {
  /** The current preferences. The same object is returned until something changes. */
  get(): DevicePreferencesValue;
  /** Calls the listener when a preference changes. Returns the unsubscribe function. */
  subscribe(listener: (value: DevicePreferencesValue) => void): () => void;
}
