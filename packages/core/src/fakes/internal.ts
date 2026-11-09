import { PortAbortError } from "../ports/errors";

/**
 * A promise that settles when a test says so. Used by the fakes' deferred
 * mode so latency is driven by the test, never by a timer.
 */
export interface HeldCall<T> {
  /** Completes the held call successfully. */
  resolve(value: T): void;
  /** Fails the held call. */
  reject(error: Error): void;
}

/** A {@link HeldCall} plus the promise a fake awaits. */
export interface Deferred<T> extends HeldCall<T> {
  readonly promise: Promise<T>;
}

/**
 * Creates a {@link Deferred}. The promise is marked handled, so a test that
 * rejects a hold before the call arrives does not trigger an unhandled
 * rejection.
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/**
 * Mirrors the port rule for cancellation. An already-aborted signal rejects
 * at once, without calling `start`, so a fake does not consume a scripted
 * outcome for a request nobody wants. A signal that fires while the promise
 * from `start` is pending rejects with a {@link PortAbortError}. Whichever
 * happens first wins. A port whose abort is a typed error of its own, such as
 * the routing port, passes `abortError` to build it.
 */
export function abortable<T>(
  start: () => Promise<T>,
  signal: AbortSignal | undefined,
  abortError: () => Error = () => new PortAbortError(),
): Promise<T> {
  if (signal === undefined) {
    return start();
  }
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  const promise = start();
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: Error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
