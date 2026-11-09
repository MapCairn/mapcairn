import { BeaconErrorReporter } from "../adapters/errorReporting/BeaconErrorReporter";

/**
 * Starts reporting uncaught client errors and unhandled rejections to
 * `/log-error`. Called once from `entry.client.tsx`, before hydration.
 * @returns A function that stops reporting.
 */
export function installErrorReporting(): () => void {
  return new BeaconErrorReporter().install();
}

/**
 * Reports an error that React caught, such as one shown by the root error
 * boundary, which never reaches the window's error event. Does nothing during
 * server rendering, where the error is logged by the server instead.
 */
export function reportCaughtError(error: unknown): void {
  new BeaconErrorReporter().report(error, "error");
}
