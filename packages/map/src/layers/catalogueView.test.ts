// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type CatalogueRefresh,
  type CatalogueState,
  SAMPLE_FEED_LAYER,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { catalogueView, hidesSection, loadFailed } from "./catalogueView";

const FAILED: CatalogueState = { status: "failed", reason: "network" };

function ready(refresh: CatalogueRefresh, skipped = 0): CatalogueState {
  return {
    status: "ready",
    layers: [SAMPLE_FEED_LAYER],
    skipped: Array.from({ length: skipped }, () => ({ problems: ["x"] })),
    refresh,
  };
}

describe("catalogueView", () => {
  it("reads a loading or failed catalogue as having no skipped definitions and no refresh", () => {
    expect(catalogueView({ status: "loading" }, true)).toEqual({
      status: "loading",
      skipped: 0,
      refresh: "idle",
      failed: false,
      awaited: true,
    });
    expect(catalogueView(FAILED, true).status).toBe("failed");
  });

  it("counts the skipped definitions of a ready catalogue and carries its refresh state", () => {
    expect(catalogueView(ready("failed", 3), false)).toEqual({
      status: "ready",
      skipped: 3,
      refresh: "failed",
      failed: true,
      awaited: false,
    });
  });
});

describe("loadFailed", () => {
  it("is true for a failed load and for a failed refresh, and for nothing else", () => {
    expect(loadFailed(FAILED)).toBe(true);
    expect(loadFailed(ready("failed"))).toBe(true);
    expect(loadFailed(ready("idle"))).toBe(false);
    expect(loadFailed(ready("loading"))).toBe(false);
    expect(loadFailed({ status: "loading" })).toBe(false);
  });

  it("is what the view reports as failed", () => {
    expect(catalogueView(FAILED, true).failed).toBe(true);
    expect(catalogueView(ready("failed"), true).failed).toBe(true);
    expect(catalogueView(ready("idle"), true).failed).toBe(false);
  });
});

describe("hidesSection", () => {
  it("hides the section only for a host whose first state was ready and empty", () => {
    const empty = catalogueView(ready("idle"), false);
    expect(hidesSection(empty, 0)).toBe(true);
    expect(hidesSection(empty, 1)).toBe(false);
    expect(hidesSection({ ...empty, awaited: true }, 0)).toBe(false);
  });

  it("shows the section for a catalogue that is loading or has failed, whatever the host started as", () => {
    expect(hidesSection(catalogueView({ status: "loading" }, false), 0)).toBe(
      false,
    );
    expect(hidesSection(catalogueView(FAILED, false), 0)).toBe(false);
  });
});
