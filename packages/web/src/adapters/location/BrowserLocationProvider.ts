import {
  type LocateOptions,
  LocationError,
  type LocationErrorKind,
  type LocationFix,
  type LocationProvider,
  type LocationWatchHandlers,
  PortAbortError,
} from "@karta/core";

/** The slice of `Geolocation` the provider uses. */
export type GeolocationLike = Pick<
  Geolocation,
  "getCurrentPosition" | "watchPosition" | "clearWatch"
>;

/** Options for {@link BrowserLocationProvider}. */
export interface BrowserLocationProviderOptions {
  /**
   * Returns the geolocation object, or undefined when there is none. Called
   * once, when the provider is built. Defaults to `navigator.geolocation`.
   */
  readonly getGeolocation?: () => GeolocationLike | undefined;
  /** How long one `locate` may take when the caller gives no limit. Defaults to 20 000 ms. */
  readonly defaultTimeoutMs?: number;
  /** Ask for a GPS-grade fix. Defaults to false: a coarse fix arrives quickly everywhere, while GPS often times out on desktops. */
  readonly enableHighAccuracy?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

// A fix up to this old is good enough for "Locate me". Together with the
// coarse default accuracy it lets desktops without GPS answer from Wi-Fi or
// network location instead of waiting for hardware that is not there.
const LOCATE_MAXIMUM_AGE_MS = 30_000;

// The numeric codes of GeolocationPositionError, which is not constructible in tests.
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

function defaultGeolocation(): GeolocationLike | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.geolocation;
}

function kindOfCode(code: unknown): LocationErrorKind {
  if (code === PERMISSION_DENIED) {
    return "denied";
  }
  return code === TIMEOUT ? "timeout" : "unavailable";
}

function toLocationError(error: unknown): LocationError {
  if (error instanceof LocationError) {
    return error;
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code: unknown }).code
      : undefined;
  return new LocationError(kindOfCode(code));
}

/** A thrown `SecurityError` means the page may not use geolocation (insecure context, policy). */
function toThrownError(error: unknown): LocationError {
  const name = error instanceof Error ? error.name : "";
  return new LocationError(name === "SecurityError" ? "denied" : "unavailable");
}

function toFix(position: GeolocationPosition): LocationFix {
  return {
    position: {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    },
    accuracyMetres: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

/**
 * A {@link LocationProvider} over `navigator.geolocation`.
 *
 * @remarks Nothing touches geolocation, and so no permission prompt appears,
 *   until `locate` or `watch` is called. Call them from a user action: Safari
 *   shows its prompt only for a gesture. `supportsWatch` is true, and `watch`
 *   exists, only when the browser has geolocation at all; without it `locate`
 *   rejects with `LocationError("unavailable")`.
 *
 *   Browser errors map by code: 1 is `denied`, 3 is `timeout`, and 2 or
 *   anything unexpected is `unavailable`. A synchronous `SecurityError` (an
 *   insecure page, or a permissions policy that blocks geolocation) is
 *   `denied`. Safari reports "location services are off for the device" as
 *   code 1 too, so `denied` can mean either. Geolocation cannot be cancelled
 *   once asked, so an abort rejects at once and a late answer is ignored.
 *   Watches ask for no timeout, because a timeout error on a watch would
 *   repeat for as long as the signal is live.
 */
export class BrowserLocationProvider implements LocationProvider {
  readonly supportsWatch: boolean;
  readonly watch?: (
    handlers: LocationWatchHandlers,
    options: { readonly signal: AbortSignal },
  ) => void;

  readonly #geolocation: GeolocationLike | undefined;
  readonly #defaultTimeoutMs: number;
  readonly #enableHighAccuracy: boolean;

  constructor(options: BrowserLocationProviderOptions = {}) {
    this.#geolocation = (options.getGeolocation ?? defaultGeolocation)();
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#enableHighAccuracy = options.enableHighAccuracy ?? false;
    this.supportsWatch = this.#geolocation !== undefined;
    if (this.supportsWatch) {
      this.watch = (handlers, watchOptions) =>
        this.#watch(handlers, watchOptions.signal);
    }
  }

  locate(options: LocateOptions = {}): Promise<LocationFix> {
    const { signal, timeoutMs } = options;
    if (signal?.aborted) {
      return Promise.reject(new PortAbortError());
    }
    const geolocation = this.#geolocation;
    if (geolocation === undefined) {
      return Promise.reject(new LocationError("unavailable"));
    }
    return new Promise<LocationFix>((resolve, reject) => {
      let settled = false;
      const onAbort = () => settle(() => reject(new PortAbortError()));
      const settle = (finish: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        finish();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        geolocation.getCurrentPosition(
          (position) => settle(() => resolve(toFix(position))),
          (error) => settle(() => reject(toLocationError(error))),
          {
            enableHighAccuracy: this.#enableHighAccuracy,
            timeout: timeoutMs ?? this.#defaultTimeoutMs,
            maximumAge: LOCATE_MAXIMUM_AGE_MS,
          },
        );
      } catch (error) {
        settle(() => reject(toThrownError(error)));
      }
    });
  }

  #watch(handlers: LocationWatchHandlers, signal: AbortSignal): void {
    const geolocation = this.#geolocation;
    if (geolocation === undefined || signal.aborted) {
      return;
    }
    let id: number | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      signal.removeEventListener("abort", stop);
      if (id !== undefined) {
        geolocation.clearWatch(id);
      }
    };
    signal.addEventListener("abort", stop, { once: true });
    try {
      id = geolocation.watchPosition(
        (position) => {
          if (!stopped) {
            handlers.onFix(toFix(position));
          }
        },
        (error) => {
          if (!stopped) {
            handlers.onError(toLocationError(error));
          }
        },
        { enableHighAccuracy: this.#enableHighAccuracy, maximumAge: 0 },
      );
    } catch (error) {
      signal.removeEventListener("abort", stop);
      stopped = true;
      handlers.onError(toThrownError(error));
    }
  }
}
