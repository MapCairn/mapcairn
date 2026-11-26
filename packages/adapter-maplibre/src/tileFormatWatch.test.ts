// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { TileFormatWatch } from "./tileFormatWatch";

const TILES = "https://t.test/{z}/{x}/{y}.pbf";
const PARSE_FAILURE = new Error(
  "Unable to parse the tile at https://t.test/3/4/5.pbf, got error: Block overruns tile: 541 > 75",
);

function setUp() {
  const wrongFormat = vi.fn();
  const recovered = vi.fn();
  const watch = new TileFormatWatch({ wrongFormat, recovered });
  watch.register("src", "roads", TILES);
  return { watch, wrongFormat, recovered };
}

describe("TileFormatWatch", () => {
  it("takes a tile the engine could not read for a source it watches", () => {
    const { watch } = setUp();
    expect(watch.recordFailed("src", PARSE_FAILURE)).toBe(true);
  });

  it.each([
    ["a source it does not watch", "other", PARSE_FAILURE],
    [
      "a failure that is not a parse failure",
      "src",
      new Error("Failed to fetch"),
    ],
    ["a failure with no error", "src", undefined],
    ["a source that is not named", undefined, PARSE_FAILURE],
  ])("leaves %s to the general handling", (_name, source, error) => {
    const { watch, wrongFormat } = setUp();
    expect(watch.recordFailed(source, error)).toBe(false);
    watch.reportSettled();
    expect(wrongFormat).not.toHaveBeenCalled();
  });

  it("reports the layer once, when the map settles with a tile unreadable and none loaded", () => {
    const { watch, wrongFormat } = setUp();
    watch.recordFailed("src", PARSE_FAILURE);
    watch.recordFailed("src", PARSE_FAILURE);
    expect(wrongFormat).not.toHaveBeenCalled();
    watch.reportSettled();
    watch.reportSettled();
    expect(wrongFormat).toHaveBeenCalledExactlyOnceWith({
      layerId: "roads",
      tiles: TILES,
    });
  });

  it("says nothing of a layer that has loaded a tile, however many fail", () => {
    const { watch, wrongFormat } = setUp();
    watch.recordLoaded("src");
    watch.recordFailed("src", PARSE_FAILURE);
    watch.reportSettled();
    expect(wrongFormat).not.toHaveBeenCalled();
  });

  it("reports a recovery once, when the first tile loads after the layer was reported", () => {
    const { watch, recovered } = setUp();
    watch.recordFailed("src", PARSE_FAILURE);
    watch.reportSettled();
    expect(recovered).not.toHaveBeenCalled();
    watch.recordLoaded("src");
    watch.recordLoaded("src");
    expect(recovered).toHaveBeenCalledExactlyOnceWith({
      layerId: "roads",
      tiles: TILES,
    });
  });

  it("reports no recovery for a layer that was never reported", () => {
    const { watch, recovered } = setUp();
    watch.recordLoaded("src");
    watch.recordFailed("src", PARSE_FAILURE);
    watch.reportSettled();
    watch.recordLoaded("src");
    expect(recovered).not.toHaveBeenCalled();
  });

  it("says nothing of a layer that failed no tile", () => {
    const { watch, wrongFormat } = setUp();
    watch.reportSettled();
    expect(wrongFormat).not.toHaveBeenCalled();
  });

  it("counts again for a source drawn over, and forgets one that was released", () => {
    const { watch, wrongFormat } = setUp();
    watch.recordFailed("src", PARSE_FAILURE);
    watch.reportSettled();
    watch.register("src", "roads", TILES);
    watch.recordFailed("src", PARSE_FAILURE);
    watch.reportSettled();
    expect(wrongFormat).toHaveBeenCalledTimes(2);
    watch.release("src");
    expect(watch.recordFailed("src", PARSE_FAILURE)).toBe(false);
  });
});
