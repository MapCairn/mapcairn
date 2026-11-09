import { describe, expect, it } from "vitest";
import {
  LocationError,
  MapEngineError,
  PortAbortError,
  SearchError,
} from "./errors";

describe("port errors", () => {
  it("carries the search error kind and a default message", () => {
    const error = new SearchError("rate-limited");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SearchError");
    expect(error.kind).toBe("rate-limited");
    expect(error.message).toContain("rate-limited");
  });

  it("carries the location error kind and accepts a custom message", () => {
    const error = new LocationError("denied", "No permission.");
    expect(error.name).toBe("LocationError");
    expect(error.kind).toBe("denied");
    expect(error.message).toBe("No permission.");
  });

  it("carries the map engine error reason", () => {
    const error = new MapEngineError("webgl-unavailable");
    expect(error.name).toBe("MapEngineError");
    expect(error.reason).toBe("webgl-unavailable");
    expect(error.message).toContain("webgl-unavailable");
  });

  it("names the abort error so callers can ignore it", () => {
    const error = new PortAbortError();
    expect(error.name).toBe("PortAbortError");
    expect(error).toBeInstanceOf(Error);
  });
});
