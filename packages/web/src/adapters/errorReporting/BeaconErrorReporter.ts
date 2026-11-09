import {
  CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH,
  CLIENT_ERROR_REPORT_PATH,
} from "../../constants/clientErrorReporting";

/** Distinguishes an uncaught script error from an unhandled promise rejection in a report. */
export type ClientErrorSource = "error" | "unhandledrejection";

/** Body POSTed to `/log-error`, matching that route's `clientErrorReportSchema`. */
interface ClientErrorReport {
  readonly message: string;
  readonly stack?: string;
  readonly url: string;
  readonly source: ClientErrorSource;
}

/** The slice of `window` the reporter reads and listens to. */
export interface ErrorReportingWindow {
  readonly location: { readonly href: string };
  readonly navigator: {
    readonly sendBeacon?: (url: string, data: Blob) => boolean;
  };
  fetch(input: string, init: RequestInit): Promise<unknown>;
  addEventListener(
    type: "error" | "unhandledrejection",
    listener: (event: Event) => void,
  ): void;
  removeEventListener(
    type: "error" | "unhandledrejection",
    listener: (event: Event) => void,
  ): void;
}

/** Options for {@link BeaconErrorReporter}. */
export interface BeaconErrorReporterOptions {
  /** Returns the window. Called on every report. Defaults to `globalThis.window`. */
  readonly getWindow?: () => ErrorReportingWindow | undefined;
}

function defaultWindow(): ErrorReportingWindow | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as ErrorReportingWindow);
}

function truncate(value: string): string {
  return value.length > CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH
    ? value.slice(0, CLIENT_ERROR_REPORT_MAX_FIELD_LENGTH)
    : value;
}

/**
 * Sends client errors to `/log-error`, so they reach Cloudflare Workers Logs.
 *
 * @remarks Prefers `navigator.sendBeacon`, which queues the send and is not
 *   cancelled by page unload (some errors happen moments before the page goes
 *   away), and falls back to `fetch` with `keepalive`. Every field is cut to
 *   the length the route accepts. Reporting never throws: a failure here must
 *   not become a second uncaught error that re-enters the listeners. Without
 *   a window (server rendering) it does nothing.
 */
export class BeaconErrorReporter {
  readonly #getWindow: () => ErrorReportingWindow | undefined;

  constructor({ getWindow = defaultWindow }: BeaconErrorReporterOptions = {}) {
    this.#getWindow = getWindow;
  }

  /** Reports one error. Never throws. */
  report(error: unknown, source: ClientErrorSource): void {
    try {
      const target = this.#getWindow();
      if (!target) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const report: ClientErrorReport = {
        message: truncate(message),
        stack: stack === undefined ? undefined : truncate(stack),
        url: truncate(target.location.href),
        source,
      };
      const body = JSON.stringify(report);
      const sentViaBeacon = target.navigator.sendBeacon?.(
        CLIENT_ERROR_REPORT_PATH,
        new Blob([body], { type: "application/json" }),
      );
      if (!sentViaBeacon) {
        void target
          .fetch(CLIENT_ERROR_REPORT_PATH, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          })
          .catch(() => undefined);
      }
    } catch {
      // Reporting must never throw; see the class remarks.
    }
  }

  /**
   * Reports uncaught script errors and unhandled promise rejections until the
   * returned function is called.
   *
   * @remarks The listeners are added without the capture flag, so, like
   *   `window.onerror`, they see script errors only, not resource failures
   *   such as a missing tile image, which do not bubble to the window.
   */
  install(): () => void {
    const target = this.#getWindow();
    if (!target) {
      return () => undefined;
    }
    const onError = (event: Event) => {
      const errorEvent = event as ErrorEvent;
      this.report(errorEvent.error ?? errorEvent.message, "error");
    };
    const onRejection = (event: Event) => {
      this.report(
        (event as PromiseRejectionEvent).reason,
        "unhandledrejection",
      );
    };
    target.addEventListener("error", onError);
    target.addEventListener("unhandledrejection", onRejection);
    return () => {
      target.removeEventListener("error", onError);
      target.removeEventListener("unhandledrejection", onRejection);
    };
  }
}
