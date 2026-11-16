// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeatureRef } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  addedAnnouncement,
  clearedAnnouncement,
  removedAnnouncement,
} from "./selectionMessages";

const ref = (id: string): FeatureRef => ({ layerId: "gauges", featureId: id });
const A = ref("a");
const B = ref("b");
const titleOf = (given: FeatureRef) => (given === A ? "Gauge 4" : null);

describe("selection messages are keys and parameters", () => {
  it("names the one feature added, with the running total", () => {
    expect(addedAnnouncement([A], [], [A], 10, titleOf)).toEqual({
      message: {
        key: "announce.featureSelected",
        params: { title: "Gauge 4", total: 1 },
      },
      options: { priority: "polite" },
    });
  });

  it("counts several features added, and says when the limit refused them", () => {
    expect(addedAnnouncement([A, B], [], [A, B], 10, titleOf)?.message).toEqual(
      { key: "announce.featuresSelected", params: { count: 2, total: 2 } },
    );
    expect(addedAnnouncement([B], [A], [A], 1, titleOf)).toEqual({
      message: { key: "announce.selectionFull", params: { limit: 1 } },
      options: { priority: "assertive" },
    });
  });

  it("names what was removed and what was cleared", () => {
    expect(removedAnnouncement([A, B], [B], titleOf)?.message).toEqual({
      key: "announce.featureDeselected",
      params: { title: "Gauge 4", total: 1 },
    });
    expect(removedAnnouncement([A, B], [], titleOf)?.message).toEqual({
      key: "announce.featuresDeselected",
      params: { count: 2, total: 0 },
    });
    expect(clearedAnnouncement([A])?.message).toEqual({
      key: "announce.selectionCleared",
      params: {},
    });
  });
});
