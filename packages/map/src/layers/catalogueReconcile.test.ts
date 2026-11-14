// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  defaultControlValues,
  type LayerDefinition,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  type Chosen,
  type Link,
  type ReconcileInputs,
  reconcile,
} from "./catalogueReconcile";

const NOW = Date.UTC(2026, 10, 9, 12);
const NOTHING_CHOSEN: Chosen = { enabled: [], controls: {} };
const NO_LINK: Link = { waiting: [], controls: {} };

function inputs(overrides: Partial<ReconcileInputs> = {}): ReconcileInputs {
  return {
    chosen: NOTHING_CHOSEN,
    link: NO_LINK,
    known: [],
    next: [SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER, SAMPLE_TILE_LAYER],
    now: NOW,
    ...overrides,
  };
}

describe("reconcile", () => {
  describe("the layers a link names", () => {
    it("turns on the ones the list has, in the link's order, with their control values resolved", () => {
      const { chosen, link } = reconcile(
        inputs({
          link: {
            waiting: ["sample-points", "sample-alerts"],
            controls: { "sample-points": { window: "hour", small: "maybe" } },
          },
        }),
      );
      expect(chosen.enabled).toEqual(["sample-points", "sample-alerts"]);
      expect(chosen.controls["sample-points"]).toEqual({
        window: "hour",
        small: "false",
      });
      expect(link.waiting).toEqual([]);
    });

    it("drops the ones it has not got, and counts them", () => {
      const { chosen, linkMissing } = reconcile(
        inputs({
          link: { waiting: ["sample-alerts", "gone", "also"], controls: {} },
        }),
      );
      expect(chosen.enabled).toEqual(["sample-alerts"]);
      expect(linkMissing).toBe(2);
    });

    it("counts none when every one is in the list", () => {
      const { linkMissing } = reconcile(
        inputs({ link: { waiting: ["sample-alerts"], controls: {} } }),
      );
      expect(linkMissing).toBe(0);
    });

    it("counts the ids the link carried past its limit with the ones the list has not got, and says them once", () => {
      const { linkMissing, link } = reconcile(
        inputs({
          link: {
            waiting: ["sample-alerts", "gone"],
            controls: {},
            dropped: 3,
          },
        }),
      );
      expect(linkMissing).toBe(4);
      expect(link).toEqual({ waiting: [], controls: {} });
    });

    it("counts the ids past the limit when every id that was kept is in the list", () => {
      const { linkMissing } = reconcile(
        inputs({
          link: { waiting: ["sample-alerts"], controls: {}, dropped: 2 },
        }),
      );
      expect(linkMissing).toBe(2);
    });

    it("does not turn a layer on twice", () => {
      const { chosen } = reconcile(
        inputs({
          chosen: { enabled: ["sample-alerts"], controls: {} },
          known: [SAMPLE_ALERT_LAYER],
          link: { waiting: ["sample-alerts"], controls: {} },
        }),
      );
      expect(chosen.enabled).toEqual(["sample-alerts"]);
    });
  });

  describe("layers that arrive", () => {
    it("gives each its controls' defaults, and a layer with no controls none", () => {
      const { chosen } = reconcile(inputs());
      expect(chosen.controls["sample-points"]).toEqual(
        defaultControlValues(SAMPLE_FEED_LAYER, NOW),
      );
      expect(chosen.controls["sample-imagery"]).toEqual(
        defaultControlValues(SAMPLE_TILE_LAYER, NOW),
      );
      expect(chosen.controls["sample-alerts"]).toEqual({});
    });

    it("ignores the link's values for a layer that is not waiting in it", () => {
      const { chosen } = reconcile(
        inputs({
          link: {
            waiting: [],
            controls: { "sample-points": { window: "hour" } },
          },
        }),
      );
      expect(chosen.controls["sample-points"]?.window).toBe("day");
    });
  });

  describe("layers that go", () => {
    const before = [SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER];

    it("turns an enabled one off, names it, and forgets its controls", () => {
      const result = reconcile(
        inputs({
          known: before,
          next: [SAMPLE_ALERT_LAYER],
          chosen: {
            enabled: ["sample-points", "sample-alerts"],
            controls: {
              "sample-points": { window: "hour", small: "false" },
              "sample-alerts": {},
            },
          },
        }),
      );
      expect(result.chosen.enabled).toEqual(["sample-alerts"]);
      expect(result.chosen.controls).toEqual({ "sample-alerts": {} });
      expect(result.switchedOff).toEqual([
        { id: "sample-points", name: "Sample points" },
      ]);
      expect(result.removed).toEqual(["sample-points"]);
    });

    it("counts several that go together", () => {
      const result = reconcile(
        inputs({
          known: before,
          next: [],
          chosen: { enabled: ["sample-points", "sample-alerts"], controls: {} },
        }),
      );
      expect(result.switchedOff).toEqual([
        { id: "sample-points", name: "Sample points" },
        { id: "sample-alerts", name: "Sample alerts" },
      ]);
      expect(result.removed).toEqual(["sample-points", "sample-alerts"]);
    });

    it("lists a layer that was off as removed, but does not switch it off", () => {
      const result = reconcile(
        inputs({
          known: before,
          next: [SAMPLE_ALERT_LAYER],
          chosen: {
            enabled: [],
            controls: defaultsOf(before),
          },
        }),
      );
      expect(result.switchedOff).toEqual([]);
      expect(result.removed).toEqual(["sample-points"]);
      expect(Object.keys(result.chosen.controls)).toEqual(["sample-alerts"]);
    });
  });

  describe("what the list added and removed", () => {
    it("names the ids that are new in the list and those that are gone from it", () => {
      const result = reconcile(
        inputs({
          known: [SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER],
          next: [SAMPLE_ALERT_LAYER, SAMPLE_TILE_LAYER],
        }),
      );
      expect(result.added).toEqual(["sample-imagery"]);
      expect(result.removed).toEqual(["sample-points"]);
    });

    it("names nothing when the list is the same", () => {
      const result = reconcile(
        inputs({
          known: [SAMPLE_FEED_LAYER],
          next: [SAMPLE_FEED_LAYER],
        }),
      );
      expect(result.added).toEqual([]);
      expect(result.removed).toEqual([]);
    });
  });

  describe("a changed definition", () => {
    const changed: LayerDefinition = {
      ...SAMPLE_FEED_LAYER,
      controls: [
        {
          kind: "segmented",
          id: "window",
          label: "Period",
          options: [
            { value: "week", label: "Week" },
            { value: "day", label: "Day" },
          ],
          default: "week",
        },
      ],
    };

    it("keeps the control values that are still valid and defaults the rest", () => {
      const keeps = reconcile(
        inputs({
          known: [SAMPLE_FEED_LAYER],
          next: [changed],
          chosen: {
            enabled: ["sample-points"],
            controls: { "sample-points": { window: "day", small: "true" } },
          },
        }),
      );
      expect(keeps.chosen.controls["sample-points"]).toEqual({ window: "day" });
      const defaults = reconcile(
        inputs({
          known: [SAMPLE_FEED_LAYER],
          next: [changed],
          chosen: {
            enabled: ["sample-points"],
            controls: { "sample-points": { window: "hour", small: "true" } },
          },
        }),
      );
      expect(defaults.chosen.controls["sample-points"]).toEqual({
        window: "week",
      });
      expect(defaults.chosen.enabled).toEqual(["sample-points"]);
    });

    it("leaves the controls of an unchanged definition as they are, the same object", () => {
      const controls = { "sample-points": { window: "hour", small: "false" } };
      const result = reconcile(
        inputs({
          known: [SAMPLE_FEED_LAYER],
          next: [SAMPLE_FEED_LAYER],
          chosen: { enabled: ["sample-points"], controls },
        }),
      );
      expect(result.chosen.controls["sample-points"]).toBe(
        controls["sample-points"],
      );
    });
  });
});

function defaultsOf(definitions: readonly LayerDefinition[]) {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      defaultControlValues(definition, NOW),
    ]),
  );
}
