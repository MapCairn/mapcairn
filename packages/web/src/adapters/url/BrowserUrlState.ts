import {
  parseUrlHash,
  serialiseUrlHash,
  type UrlState,
  type UrlStateValue,
} from "@karta/core";

/** The timer functions the adapter debounces with, injectable for tests. */
export interface UrlStateTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The slice of `window` the adapter reads and writes. */
export interface UrlStateWindow {
  readonly location: Pick<Location, "hash" | "pathname" | "search">;
  readonly history: Pick<History, "replaceState" | "state">;
  addEventListener(type: "pagehide", listener: () => void): void;
  removeEventListener(type: "pagehide", listener: () => void): void;
}

/** The slice of `document` the adapter listens to. */
export interface UrlStateDocument {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Options for {@link BrowserUrlState}. */
export interface BrowserUrlStateOptions {
  /** Returns the window. Called on every access. Defaults to `globalThis.window`. */
  readonly getWindow?: () => UrlStateWindow | undefined;
  /** Returns the document. Called on every access. Defaults to `globalThis.document`. */
  readonly getDocument?: () => UrlStateDocument | undefined;
  /** Quiet time after the last write before the address changes. Defaults to 300 ms. */
  readonly debounceMs?: number;
  /** Timer functions. Default to the global ones. */
  readonly timers?: UrlStateTimers;
}

const DEFAULT_DEBOUNCE_MS = 300;

const GLOBAL_TIMERS: UrlStateTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function defaultWindow(): UrlStateWindow | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function defaultDocument(): UrlStateDocument | undefined {
  return typeof document === "undefined" ? undefined : document;
}

/**
 * A {@link UrlState} over the page address's hash.
 *
 * @remarks Reads parse `location.hash` with the core `parseUrlHash`. Writes use
 *   `serialiseUrlHash`, wait for 300 ms of quiet so a drag is one update, and
 *   change the address with `history.replaceState` only, never `pushState`, so
 *   the back button is never spammed. The path and query string are kept, and
 *   so is `history.state`, which React Router stores its position in. A write
 *   that would not change the hash does nothing.
 *
 *   A pending write is applied at once when the page is hidden or leaves
 *   (`pagehide`, or `visibilitychange` to hidden), which is the only reliable
 *   moment on iOS Safari, where a tab can be discarded without `unload`.
 *   Safari throws a `SecurityError` when `replaceState` is called more than
 *   about 100 times in 30 seconds; the debounce keeps well under that, and if
 *   a call still throws the write is kept and retried on the next flush
 *   instead of being lost or thrown.
 *
 *   The page listeners are added on the first write and removed by
 *   {@link BrowserUrlState.dispose}.
 */
export class BrowserUrlState implements UrlState {
  readonly #getWindow: () => UrlStateWindow | undefined;
  readonly #getDocument: () => UrlStateDocument | undefined;
  readonly #debounceMs: number;
  readonly #timers: UrlStateTimers;
  #pending: UrlStateValue | undefined;
  #handle: unknown;
  #hasTimer = false;
  #listening: { window: UrlStateWindow; document?: UrlStateDocument } | null =
    null;

  constructor(options: BrowserUrlStateOptions = {}) {
    this.#getWindow = options.getWindow ?? defaultWindow;
    this.#getDocument = options.getDocument ?? defaultDocument;
    this.#debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
  }

  read(): UrlStateValue {
    try {
      return parseUrlHash(this.#getWindow()?.location.hash ?? "");
    } catch {
      return {};
    }
  }

  write(value: UrlStateValue): void {
    this.#pending = value;
    this.#listen();
    this.#cancelTimer();
    this.#hasTimer = true;
    this.#handle = this.#timers.setTimeout(() => {
      this.#hasTimer = false;
      this.flush();
    }, this.#debounceMs);
  }

  /** Applies a pending write to the address now. Does nothing when none is pending. */
  flush(): void {
    this.#cancelTimer();
    const value = this.#pending;
    if (value === undefined) {
      return;
    }
    this.#pending = undefined;
    const win = this.#getWindow();
    if (win === undefined) {
      return;
    }
    try {
      const hash = serialiseUrlHash(value);
      if (hash === win.location.hash) {
        return;
      }
      const { pathname, search } = win.location;
      win.history.replaceState(
        win.history.state,
        "",
        `${pathname}${search}${hash}`,
      );
    } catch {
      // Keep the value for the next flush, unless a newer write replaced it.
      this.#pending ??= value;
    }
  }

  /** Cancels a pending write and removes the page listeners. */
  dispose(): void {
    this.#cancelTimer();
    this.#pending = undefined;
    const listening = this.#listening;
    this.#listening = null;
    listening?.window.removeEventListener("pagehide", this.#onLeave);
    listening?.document?.removeEventListener(
      "visibilitychange",
      this.#onVisibility,
    );
  }

  #cancelTimer(): void {
    if (this.#hasTimer) {
      this.#timers.clearTimeout(this.#handle);
      this.#hasTimer = false;
    }
  }

  #listen(): void {
    if (this.#listening !== null) {
      return;
    }
    const win = this.#getWindow();
    if (win === undefined) {
      return;
    }
    const doc = this.#getDocument();
    this.#listening = doc ? { window: win, document: doc } : { window: win };
    win.addEventListener("pagehide", this.#onLeave);
    doc?.addEventListener("visibilitychange", this.#onVisibility);
  }

  readonly #onLeave = (): void => {
    this.flush();
  };

  readonly #onVisibility = (): void => {
    if (this.#getDocument()?.visibilityState === "hidden") {
      this.flush();
    }
  };
}
