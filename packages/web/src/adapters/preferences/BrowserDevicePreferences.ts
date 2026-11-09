import type { DevicePreferences, DevicePreferencesValue } from "@karta/core";
import {
  defaultMediaQueryWindow,
  type MediaQueryWindow,
  observeMediaQuery,
  readMediaQuery,
} from "../shared/mediaQuery";

/** Options for {@link BrowserDevicePreferences}. */
export interface BrowserDevicePreferencesOptions {
  /** Returns the window that answers `matchMedia`. Called on every access. Defaults to `window`. */
  readonly getWindow?: () => MediaQueryWindow | undefined;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Reports the reduced motion and fine pointer preferences from `matchMedia`.
 *
 * @remarks Where `matchMedia` is missing or throws (the server, a locked-down
 *   browser) both preferences are false: animation is allowed and the device
 *   is treated as touch. `get()` returns the same object until a preference
 *   changes. While there are subscribers, live `change` listeners keep it
 *   current; with none, each `get()` reads the queries afresh, so a value is
 *   never stale. Listeners fall back to `addListener` on Safari before 14.
 */
export class BrowserDevicePreferences implements DevicePreferences {
  readonly #getWindow: () => MediaQueryWindow | undefined;
  readonly #listeners = new Set<(value: DevicePreferencesValue) => void>();
  #value: DevicePreferencesValue;
  #stopObserving: (() => void) | undefined;

  constructor(options: BrowserDevicePreferencesOptions = {}) {
    this.#getWindow = options.getWindow ?? defaultMediaQueryWindow;
    this.#value = Object.freeze(this.#read());
  }

  get(): DevicePreferencesValue {
    if (this.#listeners.size === 0) {
      this.#refresh();
    }
    return this.#value;
  }

  subscribe(listener: (value: DevicePreferencesValue) => void): () => void {
    const entry = (value: DevicePreferencesValue) => listener(value);
    this.#refresh();
    this.#listeners.add(entry);
    if (this.#listeners.size === 1) {
      this.#observe();
    }
    return () => {
      if (this.#listeners.delete(entry) && this.#listeners.size === 0) {
        this.#stopObserving?.();
        this.#stopObserving = undefined;
      }
    };
  }

  #observe(): void {
    const onChange = () => {
      if (this.#refresh()) {
        for (const listener of [...this.#listeners]) {
          listener(this.#value);
        }
      }
    };
    const stops = [REDUCED_MOTION_QUERY, FINE_POINTER_QUERY].map((query) =>
      observeMediaQuery(readMediaQuery(this.#getWindow, query), onChange),
    );
    this.#stopObserving = () => {
      for (const stop of stops) {
        stop();
      }
    };
  }

  #read(): DevicePreferencesValue {
    return {
      reducedMotion:
        readMediaQuery(this.#getWindow, REDUCED_MOTION_QUERY)?.matches ?? false,
      finePointer:
        readMediaQuery(this.#getWindow, FINE_POINTER_QUERY)?.matches ?? false,
    };
  }

  /** Reads the queries and keeps the old object when nothing changed. Returns whether it changed. */
  #refresh(): boolean {
    const next = this.#read();
    if (
      next.reducedMotion === this.#value.reducedMotion &&
      next.finePointer === this.#value.finePointer
    ) {
      return false;
    }
    this.#value = Object.freeze(next);
    return true;
  }
}
