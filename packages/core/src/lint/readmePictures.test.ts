// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  DEMO_SIZE,
  demoPath,
  ffmpegFrameArgs,
  GIF_FPS,
  gifskiArgs,
  LIVE_MAP_URL,
  liveMapUrl,
  START_VIEW,
  STILL_SIZE,
  stillPath,
  THEMES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/readmePictures.mjs";

describe("README pictures", () => {
  it("opens the live map at the start view with the earthquakes layer on for the past week", () => {
    expect(liveMapUrl(START_VIEW)).toBe(
      `${LIVE_MAP_URL}#layers=earthquakes&earthquakes.window=week&map=3.60/-2.10000/20.00000`,
    );
  });

  it("opens the live map with no layer when asked", () => {
    expect(liveMapUrl(START_VIEW, false)).toBe(
      `${LIVE_MAP_URL}#map=3.60/-2.10000/20.00000`,
    );
  });

  it("names the files the README refers to", () => {
    expect(THEMES).toEqual(["light", "dark"]);
    expect(stillPath("docs/images", "dark")).toBe(
      "docs/images/playground-dark.png",
    );
    expect(demoPath("docs/images", "light")).toBe(
      "docs/images/playground-demo.gif",
    );
    expect(demoPath("docs/images", "dark")).toBe(
      "docs/images/playground-demo-dark.gif",
    );
  });

  it("keeps the sizes of the existing pictures", () => {
    expect(STILL_SIZE).toEqual({ width: 1440, height: 900 });
    expect(DEMO_SIZE).toEqual({ width: 960, height: 600 });
  });

  it("builds the frame extraction and the GIF join at one frame rate and size", () => {
    const frames = ffmpegFrameArgs("in.webm", "frames", 3.14).join(" ");
    expect(frames).toContain("-ss 3.1 -i in.webm");
    expect(frames).toContain(`fps=${GIF_FPS},scale=960:600`);
    expect(frames).toContain("frames/frame-%04d.png");
    const gif = gifskiArgs(["frames/a.png", "frames/b.png"], "out.gif");
    expect(gif).toContain(String(GIF_FPS));
    expect(gif).toContain("out.gif");
    expect(gif.slice(-2)).toEqual(["frames/a.png", "frames/b.png"]);
  });
});
