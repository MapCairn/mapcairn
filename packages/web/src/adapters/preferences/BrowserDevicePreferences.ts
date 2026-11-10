import type { DevicePreferences, DevicePreferencesValue } from "@mapcairn/core";
import {
  defaultMediaQueryWindow,
  type MediaQueryWindow,
  observeMediaQuery,
  readMediaQuery,
} from "../shared/mediaQuery";

/**
 * The slice of the Network Information API (`navigator.connection`) the
 * adapter reads. Chrome, Edge and Samsung Internet have it; Firefox and
 * Safari, including every browser on iOS, do not.
 */
export interface NetworkInformationLike {
  /** The user turned on a data saver in the browser or the device. */
  readonly saveData?: boolean;
  /** `slow-2g`, `2g`, `3g` or `4g`, as the browser estimates it. */
  readonly effectiveType?: string;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
}

/** Options for {@link BrowserDevicePreferences}. */
export interface BrowserDevicePreferencesOptions {
  /** Returns the window that answers `matchMedia`. Called on every access. Defaults to `window`. */
  readonly getWindow?: () => MediaQueryWindow | undefined;
  /** Returns the connection information. Called on every access. Defaults to `navigator.connection`. */
  readonly getConnection?: () => NetworkInformationLike | undefined;
}

/** Connection types so slow that a person is treated as asking to save data. */
const SLOW_CONNECTIONS: ReadonlySet<string> = new Set(["slow-2g", "2g"]);

/** `navigator.connection`, or undefined where the browser has none. */
function defaultConnection(): NetworkInformationLike | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator as { connection?: NetworkInformationLike }).connection;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Reports the reduced motion and fine pointer preferences from `matchMedia`,
 * and whether the device asks to save data from `navigator.connection`.
 *
 * @remarks Where `matchMedia` is missing or throws (the server, a locked-down
 *   browser) both preferences are false: animation is allowed and the device
 *   is treated as touch. Save data is on when the browser reports a data
 *   saver (`saveData`) or a `slow-2g` or `2g` effective connection, and off
 *   wherever there is no such information (iOS has none), so there the
 *   Settings switch is the only way to turn it on. The connection API is read
 *   locally and nothing about it is sent anywhere. `get()` returns the same object until a preference
 *   changes. While there are subscribers, live `change` listeners keep it
 *   current; with none, each `get()` reads the queries afresh, so a value is
 *   never stale. Listeners fall back to `addListener` on Safari before 14.
 */
export class BrowserDevicePreferences implements DevicePreferences {
  readonly #getWindow: () => MediaQueryWindow | undefined;
  readonly #getConnection: () => NetworkInformationLike | undefined;
  readonly #listeners = new Set<(value: DevicePreferencesValue) => void>();
  #value: DevicePreferencesValue;
  #stopObserving: (() => void) | undefined;

  constructor(options: BrowserDevicePreferencesOptions = {}) {
    this.#getWindow = options.getWindow ?? defaultMediaQueryWindow;
    this.#getConnection = options.getConnection ?? defaultConnection;
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
    const connection = this.#connection();
    connection?.addEventListener?.("change", onChange);
    this.#stopObserving = () => {
      for (const stop of stops) {
        stop();
      }
      connection?.removeEventListener?.("change", onChange);
    };
  }

  /** The connection information, or undefined when there is none or reading it throws. */
  #connection(): NetworkInformationLike | undefined {
    try {
      return this.#getConnection() ?? undefined;
    } catch {
      return undefined;
    }
  }

  #read(): DevicePreferencesValue {
    const connection = this.#connection();
    return {
      reducedMotion:
        readMediaQuery(this.#getWindow, REDUCED_MOTION_QUERY)?.matches ?? false,
      finePointer:
        readMediaQuery(this.#getWindow, FINE_POINTER_QUERY)?.matches ?? false,
      saveData:
        connection?.saveData === true ||
        SLOW_CONNECTIONS.has(connection?.effectiveType ?? ""),
    };
  }

  /** Reads the queries and keeps the old object when nothing changed. Returns whether it changed. */
  #refresh(): boolean {
    const next = this.#read();
    if (
      next.reducedMotion === this.#value.reducedMotion &&
      next.finePointer === this.#value.finePointer &&
      next.saveData === this.#value.saveData
    ) {
      return false;
    }
    this.#value = Object.freeze(next);
    return true;
  }
}
