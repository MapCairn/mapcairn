// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("page error reporting", () => {
  let sendBeacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an error caught by React and the same error reaching the window only once", async () => {
    const { installErrorReporting, reportCaughtError } = await import(
      "./errorReporting"
    );
    const uninstall = installErrorReporting();
    const error = new Error("render failed");

    reportCaughtError(error);
    const event = new Event("error") as ErrorEvent;
    Object.defineProperty(event, "error", { value: error });
    window.dispatchEvent(event);
    uninstall();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  it("caps caught errors across calls, as one page load", async () => {
    const { reportCaughtError } = await import("./errorReporting");
    const { MAX_REPORTS_PER_PAGE } = await import(
      "../adapters/errorReporting/BeaconErrorReporter"
    );

    for (let index = 0; index < MAX_REPORTS_PER_PAGE + 2; index += 1) {
      reportCaughtError(new Error(`caught ${index}`));
    }

    expect(sendBeacon).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });
});
