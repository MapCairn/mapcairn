// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

/** The slice of `window` that reports `online` and `offline`. */
export interface NetworkEventTarget {
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
}

/** Options for {@link BrowserDevicePreferences}. */
export interface BrowserDevicePreferencesOptions {
  /** Returns the window that answers `matchMedia`. Called on every access. Defaults to `window`. */
  readonly getWindow?: () => MediaQueryWindow | undefined;
  /** Returns the connection information. Called on every access. Defaults to `navigator.connection`. */
  readonly getConnection?: () => NetworkInformationLike | undefined;
  /** Returns the browser's languages, most preferred first. Called on every read. Defaults to `navigator.languages`. */
  readonly getLanguages?: () => readonly string[] | undefined;
  /** Returns `navigator.onLine`, or undefined where there is no signal. Called on every read. Defaults to `navigator.onLine`. */
  readonly getOnline?: () => boolean | undefined;
  /** Returns the target of the `online` and `offline` events. Called when the first listener subscribes. Defaults to `window`. */
  readonly getEvents?: () => NetworkEventTarget | undefined;
}

/** Connection types so slow that a person is treated as asking to save data. */
const SLOW_CONNECTIONS: ReadonlySet<string> = new Set(["slow-2g", "2g"]);

/** `navigator.connection`, or undefined where the browser has none. */
function defaultConnection(): NetworkInformationLike | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator as { connection?: NetworkInformationLike }).connection;
}

/** `navigator.languages`, or undefined where there is no `navigator`. */
function defaultLanguages(): readonly string[] | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.languages;
}

/** `navigator.onLine`, or undefined where there is no `navigator`. */
function defaultOnline(): boolean | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.onLine;
}

/** `window`, which fires `online` and `offline`, or undefined where there is none. */
function defaultEvents(): NetworkEventTarget | undefined {
  return typeof window === "undefined" ? undefined : window;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Reports the reduced motion and fine pointer preferences from `matchMedia`,
 * and whether the device asks to save data from `navigator.connection`. It
 * also reports `navigator.languages`, read afresh with the rest (the browser
 * announces no change to it that the adapter listens for, so a change made
 * while the page is open shows at the next `get()` with no subscribers or the
 * next change of another preference).
 *
 * @remarks Where `matchMedia` is missing or throws (the server, a locked-down
 *   browser) both preferences are false: animation is allowed and the device
 *   is treated as touch. Save data is on when the browser reports a data
 *   saver (`saveData`) or a `slow-2g` or `2g` effective connection, and off
 *   wherever there is no such information (iOS has none), so there the
 *   Settings switch is the only way to turn it on. The connection API is read
 *   locally and nothing about it is sent anywhere. `online` is
 *   `navigator.onLine` (true where there is no signal), kept current by the
 *   window's `online` and `offline` events; it is only the browser's own hint,
 *   and no request is made to test it. `get()` returns the same object until a preference
 *   changes. While there are subscribers, live `change` listeners keep it
 *   current; with none, each `get()` reads the queries afresh, so a value is
 *   never stale. Listeners fall back to `addListener` on Safari before 14.
 */
export class BrowserDevicePreferences implements DevicePreferences {
  readonly #getWindow: () => MediaQueryWindow | undefined;
  readonly #getConnection: () => NetworkInformationLike | undefined;
  readonly #getLanguages: () => readonly string[] | undefined;
  readonly #getOnline: () => boolean | undefined;
  readonly #getEvents: () => NetworkEventTarget | undefined;
  readonly #listeners = new Set<(value: DevicePreferencesValue) => void>();
  #value: DevicePreferencesValue;
  #stopObserving: (() => void) | undefined;

  constructor(options: BrowserDevicePreferencesOptions = {}) {
    this.#getWindow = options.getWindow ?? defaultMediaQueryWindow;
    this.#getConnection = options.getConnection ?? defaultConnection;
    this.#getLanguages = options.getLanguages ?? defaultLanguages;
    this.#getOnline = options.getOnline ?? defaultOnline;
    this.#getEvents = options.getEvents ?? defaultEvents;
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
    const events = this.#events();
    events?.addEventListener("online", onChange);
    events?.addEventListener("offline", onChange);
    this.#stopObserving = () => {
      events?.removeEventListener("online", onChange);
      events?.removeEventListener("offline", onChange);
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

  /** The target of the `online` and `offline` events, or undefined when there is none or reading it throws. */
  #events(): NetworkEventTarget | undefined {
    try {
      return this.#getEvents();
    } catch {
      return undefined;
    }
  }

  /** `navigator.onLine`, treating no signal, or reading it throwing, as online. */
  #online(): boolean {
    try {
      return this.#getOnline() !== false;
    } catch {
      return true;
    }
  }

  /** The browser's languages, or none when there are none or reading them throws. */
  #languages(): readonly string[] {
    try {
      return [...(this.#getLanguages() ?? [])];
    } catch {
      return [];
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
      languages: this.#languages(),
      online: this.#online(),
    };
  }

  /** Reads the queries and keeps the old object when nothing changed. Returns whether it changed. */
  #refresh(): boolean {
    const next = this.#read();
    if (
      next.reducedMotion === this.#value.reducedMotion &&
      next.finePointer === this.#value.finePointer &&
      next.saveData === this.#value.saveData &&
      next.online === this.#value.online &&
      next.languages.join(",") === this.#value.languages.join(",")
    ) {
      return false;
    }
    this.#value = Object.freeze(next);
    return true;
  }
}
