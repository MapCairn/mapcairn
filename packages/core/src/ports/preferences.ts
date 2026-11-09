/** The device and accessibility preferences the interface adapts to. */
export interface DevicePreferencesValue {
  /** The user asked the system to reduce motion. */
  readonly reducedMotion: boolean;
  /** The primary input is a fine pointer that can hover, such as a mouse. */
  readonly finePointer: boolean;
  /**
   * The device or browser signals that data is scarce or costly: a "save
   * data" request, or a very slow connection (`slow-2g` or `2g`). It is
   * only the default for the Save data setting; a person's own choice wins.
   * Always false where the browser gives no signal (Safari on iOS has none).
   */
  readonly saveData: boolean;
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
