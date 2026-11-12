// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  FileOpenError,
  LayerError,
  LocationError,
  MapEngineError,
  MapImageExportError,
  type MapImageExportErrorKind,
  PortAbortError,
  RoutingError,
  type RoutingErrorKind,
  SearchError,
} from "./errors";

describe("port errors", () => {
  it("carries the layer error kind and a default message", () => {
    const error = new LayerError("empty");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("LayerError");
    expect(error.kind).toBe("empty");
    expect(error.message).toContain("empty");
    expect(new LayerError("network", "Offline.").message).toBe("Offline.");
  });

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

  it("carries the routing error kind and a default message", () => {
    const kinds: RoutingErrorKind[] = [
      "network",
      "invalid",
      "no-route",
      "rate-limited",
      "aborted",
      "unsupported",
    ];
    for (const kind of kinds) {
      const error = new RoutingError(kind);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("RoutingError");
      expect(error.kind).toBe(kind);
      expect(error.message).toContain(kind);
    }
    expect(new RoutingError("network", "Offline.").message).toBe("Offline.");
  });

  it("carries the file open error kind and a default message", () => {
    const error = new FileOpenError("too-large");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("FileOpenError");
    expect(error.kind).toBe("too-large");
    expect(error.message).toContain("too-large");
    expect(new FileOpenError("unreadable", "Bad file.").message).toBe(
      "Bad file.",
    );
  });

  it("carries the map engine error reason", () => {
    const error = new MapEngineError("webgl-unavailable");
    expect(error.name).toBe("MapEngineError");
    expect(error.reason).toBe("webgl-unavailable");
    expect(error.message).toContain("webgl-unavailable");
  });

  it("carries the image export error kind, and stays a MapEngineError that failed to export", () => {
    const kinds: MapImageExportErrorKind[] = [
      "invalid",
      "too-large",
      "timed-out",
    ];
    for (const kind of kinds) {
      const error = new MapImageExportError(kind, "Too big.");
      expect(error).toBeInstanceOf(MapEngineError);
      expect(error.name).toBe("MapImageExportError");
      expect(error.reason).toBe("export-failed");
      expect(error.kind).toBe(kind);
      expect(error.message).toBe("Too big.");
    }
  });

  it("names the abort error so callers can ignore it", () => {
    const error = new PortAbortError();
    expect(error.name).toBe("PortAbortError");
    expect(error).toBeInstanceOf(Error);
  });
});
