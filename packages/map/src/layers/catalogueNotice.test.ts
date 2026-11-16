// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type CatalogueRefresh,
  type CatalogueState,
  type LayerDefinition,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  type SkippedDefinition,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { inEnglish } from "../ui/LiveRegion/englishAnnounce";
import { type CatalogueNoticeInputs, catalogueNotice } from "./catalogueNotice";
import type { Reconciled } from "./catalogueReconcile";

const LOADING: CatalogueState = { status: "loading" };
const FAILED: CatalogueState = { status: "failed", reason: "network" };

const SKIPPED: SkippedDefinition = { id: "bad", problems: ["id: wrong"] };

function ready(
  layers: readonly LayerDefinition[],
  skipped: readonly SkippedDefinition[] = [],
  refresh: CatalogueRefresh = "idle",
): CatalogueState {
  return { status: "ready", layers, skipped, refresh };
}

const NO_CHANGE: Reconciled = {
  chosen: { enabled: [], controls: {} },
  link: { waiting: [], controls: {} },
  added: [],
  removed: [],
  switchedOff: [],
  linkMissing: 0,
};

function inputs(
  overrides: Partial<CatalogueNoticeInputs> &
    Pick<CatalogueNoticeInputs, "next">,
): CatalogueNoticeInputs {
  return {
    previous: null,
    linkWaiting: 0,
    awaited: true,
    change: null,
    ...overrides,
  };
}

/** What a transition says, with its message in English words. */
const noticeInEnglish = (given: CatalogueNoticeInputs) =>
  inEnglish(catalogueNotice(given)) as {
    message: string;
    priority: string;
    keep: boolean;
  } | null;

describe("catalogueNotice", () => {
  describe("while the catalogue loads", () => {
    it("says so, politely, when a layer named by the link is waiting", () => {
      expect(
        noticeInEnglish(inputs({ next: LOADING, linkWaiting: 2 })),
      ).toEqual({ message: "Loading layers", priority: "polite", keep: false });
    });

    it("says nothing when no layer is waiting", () => {
      expect(noticeInEnglish(inputs({ next: LOADING }))).toBeNull();
    });

    it("says it once for the state, not again when the catalogue is still loading", () => {
      expect(
        noticeInEnglish(
          inputs({ previous: LOADING, next: LOADING, linkWaiting: 1 }),
        ),
      ).toBeNull();
    });

    it("says it again when a retry puts a failed catalogue back to loading", () => {
      expect(
        noticeInEnglish(
          inputs({ previous: FAILED, next: LOADING, linkWaiting: 1 }),
        ),
      ).toEqual({ message: "Loading layers", priority: "polite", keep: false });
    });
  });

  describe("when the load fails", () => {
    it("is its own assertive message", () => {
      expect(
        noticeInEnglish(inputs({ previous: LOADING, next: FAILED })),
      ).toEqual({
        message: "Layers could not be loaded.",
        priority: "assertive",
        keep: true,
      });
    });

    it("is said once for the state", () => {
      expect(
        noticeInEnglish(inputs({ previous: FAILED, next: FAILED })),
      ).toBeNull();
    });

    it("is said again when a retry fails again", () => {
      expect(
        noticeInEnglish(inputs({ previous: LOADING, next: FAILED })),
      ).not.toBeNull();
    });
  });

  describe("when a refresh fails", () => {
    const shown = ready([SAMPLE_FEED_LAYER]);

    it("is an assertive message of its own", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: ready([SAMPLE_FEED_LAYER], [], "loading"),
            next: ready([SAMPLE_FEED_LAYER], [], "failed"),
          }),
        ),
      ).toEqual({
        message: "Layers could not be updated. Showing the last list.",
        priority: "assertive",
        keep: true,
      });
    });

    it("is not said while the section is hidden: a host that was ready and empty at mount shows nothing to be updated", () => {
      expect(
        noticeInEnglish(
          inputs({
            awaited: false,
            previous: ready([], [], "loading"),
            next: ready([], [], "failed"),
          }),
        ),
      ).toBeNull();
    });

    it("is said for an empty list that was awaited, because the section shows it", () => {
      expect(
        noticeInEnglish(
          inputs({
            awaited: true,
            previous: ready([], [], "loading"),
            next: ready([], [], "failed"),
          }),
        )?.priority,
      ).toBe("assertive");
    });

    it("is said for a host that was ready at mount once it has layers", () => {
      expect(
        noticeInEnglish(
          inputs({
            awaited: false,
            previous: ready([SAMPLE_FEED_LAYER], [], "loading"),
            next: ready([SAMPLE_FEED_LAYER], [], "failed"),
          }),
        )?.priority,
      ).toBe("assertive");
    });

    it("is said once for the state, and again after another failed refresh", () => {
      const failed = ready([SAMPLE_FEED_LAYER], [], "failed");
      expect(
        noticeInEnglish(inputs({ previous: failed, next: failed })),
      ).toBeNull();
      expect(
        noticeInEnglish(inputs({ previous: shown, next: failed })),
      ).not.toBeNull();
    });
  });

  describe("when a list arrives", () => {
    const first = ready([SAMPLE_FEED_LAYER, SAMPLE_ALERT_LAYER]);

    it("says nothing for a first list with nothing to report, and not 'updated'", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: LOADING,
            next: first,
            change: {
              ...NO_CHANGE,
              added: ["sample-points", "sample-alerts"],
            },
          }),
        ),
      ).toBeNull();
    });

    it("says the skipped count with the first list, in the singular for one", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: LOADING,
            next: ready([SAMPLE_FEED_LAYER], [SKIPPED]),
            change: NO_CHANGE,
          }),
        ),
      ).toEqual({
        message: "1 layer could not be shown.",
        priority: "polite",
        keep: true,
      });
      expect(
        noticeInEnglish(
          inputs({
            previous: LOADING,
            next: ready([SAMPLE_FEED_LAYER], [SKIPPED, SKIPPED, SKIPPED]),
            change: NO_CHANGE,
          }),
        )?.message,
      ).toBe("3 layers could not be shown.");
    });

    it("says the skipped count again when it changes, though the layers do not", () => {
      const layers = [SAMPLE_FEED_LAYER];
      expect(
        noticeInEnglish(
          inputs({
            previous: ready(layers, [SKIPPED]),
            next: ready(layers, [SKIPPED, SKIPPED]),
          }),
        )?.message,
      ).toBe("2 layers could not be shown.");
    });

    it("says nothing about a skipped count that has not changed", () => {
      const layers = [SAMPLE_FEED_LAYER];
      expect(
        noticeInEnglish(
          inputs({
            previous: ready(layers, [SKIPPED], "loading"),
            next: ready(layers, [SKIPPED]),
          }),
        ),
      ).toBeNull();
    });

    it("says that a refresh updated the list, with what it added and removed", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: ready([SAMPLE_FEED_LAYER], [], "loading"),
            next: ready([SAMPLE_ALERT_LAYER]),
            change: {
              ...NO_CHANGE,
              added: ["sample-alerts"],
              removed: ["sample-points"],
            },
          }),
        ),
      ).toEqual({
        message: "Layers updated: 1 added, 1 removed.",
        priority: "polite",
        keep: true,
      });
    });

    it("composes one message in the fixed order for a refresh that does everything", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: ready([SAMPLE_FEED_LAYER], [], "loading"),
            next: ready([SAMPLE_ALERT_LAYER], [SKIPPED]),
            linkWaiting: 0,
            change: {
              ...NO_CHANGE,
              added: ["sample-alerts"],
              removed: ["sample-points"],
              switchedOff: [{ id: "sample-points", name: "Earthquakes" }],
            },
          }),
        ),
      ).toEqual({
        message:
          "Earthquakes is no longer available and was turned off. 1 layer could not be shown. Layers updated: 1 added, 1 removed.",
        priority: "polite",
        keep: true,
      });
    });

    it("puts the link note after the layers turned off, for a catalogue that was awaited", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: LOADING,
            next: first,
            change: { ...NO_CHANGE, linkMissing: 2 },
          }),
        )?.message,
      ).toBe("2 layers in the link are not available.");
    });

    it("makes no link note for a catalogue that was ready at mount", () => {
      expect(
        noticeInEnglish(
          inputs({
            awaited: false,
            next: first,
            change: { ...NO_CHANGE, linkMissing: 2 },
          }),
        ),
      ).toBeNull();
    });

    it("says that the first list of an awaited catalogue is empty", () => {
      expect(
        noticeInEnglish(
          inputs({ previous: LOADING, next: ready([]), change: NO_CHANGE }),
        )?.message,
      ).toBe("No layers are available.");
    });

    it("says nothing about an empty list for a catalogue that was ready at mount", () => {
      expect(
        noticeInEnglish(
          inputs({ awaited: false, next: ready([]), change: NO_CHANGE }),
        ),
      ).toBeNull();
    });

    it("does not say the list is empty when a refresh empties a list that was shown", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: ready([SAMPLE_FEED_LAYER], [], "loading"),
            next: ready([]),
            change: { ...NO_CHANGE, removed: ["sample-points"] },
          }),
        )?.message,
      ).toBe("Layers updated: 1 removed.");
    });

    it("counts the first list after a failed load as a first list, not an update", () => {
      expect(
        noticeInEnglish(
          inputs({
            previous: LOADING,
            next: first,
            change: { ...NO_CHANGE, added: ["sample-points"] },
          }),
        ),
      ).toBeNull();
    });
  });
});

describe("catalogueNotice messages are keys and parameters", () => {
  it("is the failure's key, with nothing to fill in", () => {
    expect(
      catalogueNotice(inputs({ previous: LOADING, next: FAILED })),
    ).toEqual({
      message: { key: "describe.layersLoadFailed", params: {} },
      priority: "assertive",
      keep: true,
    });
  });
});
