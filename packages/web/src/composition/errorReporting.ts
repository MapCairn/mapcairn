// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { BeaconErrorReporter } from "../adapters/errorReporting/BeaconErrorReporter";

/**
 * The one reporter for this page load, created on first use. Sharing it
 * keeps de-duplication and the per-page cap across the window listeners and
 * errors React catches. On the server it is never asked to send anything,
 * since it does nothing without a window.
 */
let pageReporter: BeaconErrorReporter | undefined;

function getPageReporter(): BeaconErrorReporter {
  pageReporter ??= new BeaconErrorReporter();
  return pageReporter;
}

/**
 * Starts reporting uncaught client errors and unhandled rejections to
 * `/log-error`. Called once from `entry.client.tsx`, before hydration.
 * @returns A function that stops reporting.
 */
export function installErrorReporting(): () => void {
  return getPageReporter().install();
}

/**
 * Reports an error that React caught, such as one shown by the root error
 * boundary, which never reaches the window's error event. Does nothing during
 * server rendering, where the error is logged by the server instead.
 */
export function reportCaughtError(error: unknown): void {
  getPageReporter().report(error, "error");
}
