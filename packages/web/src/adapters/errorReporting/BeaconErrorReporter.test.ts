import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_REPORT_PATH } from "../../constants/clientErrorReporting";
import { BeaconErrorReporter } from "./BeaconErrorReporter";

async function readBeaconBody(blob: unknown): Promise<Record<string, unknown>> {
  const text = await (blob as Blob).text();
  return JSON.parse(text);
}

describe("BeaconErrorReporter", () => {
  let sendBeacon: ReturnType<typeof vi.fn>;
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon });
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("report", () => {
    it("sends an Error's message, stack, current URL and source by beacon", async () => {
      new BeaconErrorReporter().report(new Error("boom"), "error");

      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const [path, blob] = sendBeacon.mock.calls[0] as [string, Blob];
      expect(path).toBe(CLIENT_ERROR_REPORT_PATH);
      const body = await readBeaconBody(blob);
      expect(body.message).toBe("boom");
      expect(body.stack).toContain("boom");
      expect(body.url).toBe(window.location.href);
      expect(body.source).toBe("error");
    });

    it("stringifies a reason that is not an Error, with no stack", async () => {
      new BeaconErrorReporter().report(
        "something went wrong",
        "unhandledrejection",
      );

      const body = await readBeaconBody(sendBeacon.mock.calls[0]?.[1]);
      expect(body.message).toBe("something went wrong");
      expect(body.stack).toBeUndefined();
      expect(body.source).toBe("unhandledrejection");
    });

    it("cuts an oversized message to the length the route accepts", async () => {
      new BeaconErrorReporter().report(new Error("x".repeat(5000)), "error");

      const body = await readBeaconBody(sendBeacon.mock.calls[0]?.[1]);
      expect((body.message as string).length).toBe(2000);
    });

    it("falls back to fetch with keepalive when sendBeacon is missing or refuses", () => {
      vi.stubGlobal("navigator", { ...navigator, sendBeacon: undefined });
      const fetchMock = vi.fn().mockResolvedValue(new Response(null));
      vi.stubGlobal("fetch", fetchMock);

      new BeaconErrorReporter().report(new Error("boom"), "error");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(path).toBe(CLIENT_ERROR_REPORT_PATH);
      expect(init).toMatchObject({ method: "POST", keepalive: true });
    });

    it("swallows a failed fetch", async () => {
      vi.stubGlobal("navigator", { ...navigator, sendBeacon: () => false });
      const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
      vi.stubGlobal("fetch", fetchMock);

      new BeaconErrorReporter().report(new Error("boom"), "error");
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("never throws, even when sendBeacon throws", () => {
      sendBeacon.mockImplementation(() => {
        throw new Error("nope");
      });

      expect(() =>
        new BeaconErrorReporter().report(new Error("boom"), "error"),
      ).not.toThrow();
    });

    it("does nothing without a window", () => {
      const reporter = new BeaconErrorReporter({ getWindow: () => undefined });

      reporter.report(new Error("boom"), "error");

      expect(sendBeacon).not.toHaveBeenCalled();
      expect(() => reporter.install()()).not.toThrow();
    });
  });

  describe("install", () => {
    it("reports an uncaught script error", async () => {
      uninstall = new BeaconErrorReporter().install();
      const event = new Event("error") as ErrorEvent;
      Object.defineProperty(event, "error", {
        value: new Error("script boom"),
      });
      window.dispatchEvent(event);

      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const body = await readBeaconBody(sendBeacon.mock.calls[0]?.[1]);
      expect(body.message).toBe("script boom");
      expect(body.source).toBe("error");
    });

    it("falls back to the event message when there is no error object", async () => {
      uninstall = new BeaconErrorReporter().install();
      const event = new Event("error") as ErrorEvent;
      Object.defineProperty(event, "message", { value: "Script error." });
      window.dispatchEvent(event);

      const body = await readBeaconBody(sendBeacon.mock.calls[0]?.[1]);
      expect(body.message).toBe("Script error.");
    });

    it("reports an unhandled promise rejection", async () => {
      uninstall = new BeaconErrorReporter().install();
      const event = new Event("unhandledrejection") as PromiseRejectionEvent;
      Object.defineProperty(event, "reason", { value: new Error("rejected") });
      window.dispatchEvent(event);

      const body = await readBeaconBody(sendBeacon.mock.calls[0]?.[1]);
      expect(body.message).toBe("rejected");
      expect(body.source).toBe("unhandledrejection");
    });

    it("stops reporting once uninstalled", () => {
      new BeaconErrorReporter().install()();
      window.dispatchEvent(new Event("error"));

      expect(sendBeacon).not.toHaveBeenCalled();
    });
  });
});
