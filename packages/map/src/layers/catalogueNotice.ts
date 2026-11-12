// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceCatalogueChange,
  type CatalogueState,
  describeLayersLoadFailed,
  describeLayersLoading,
  describeLayersRefreshFailed,
} from "@mapcairn/core";
import type { AnnouncePriority } from "../ui/LiveRegion";
import type { Reconciled } from "./catalogueReconcile";
import { catalogueView, hidesSection } from "./catalogueView";

/** The `ready` member of a catalogue state. */
type ReadyState = Extract<CatalogueState, { status: "ready" }>;

/** What a transition of the catalogue says aloud, and how urgently. */
export interface CatalogueMessage {
  readonly message: string;
  readonly priority: AnnouncePriority;
}

/** What {@link catalogueNotice} reads. */
export interface CatalogueNoticeInputs {
  /** The state last taken in: none before the first one. */
  readonly previous: CatalogueState | null;
  /** The state the catalogue holds now. */
  readonly next: CatalogueState;
  /** How many layers the link names that no list has answered for yet. */
  readonly linkWaiting: number;
  /** Whether the catalogue was not ready at mount, so its list arrives later. */
  readonly awaited: boolean;
  /** What {@link reconcile} worked out for a new list, or null when the list is the one already taken in. */
  readonly change: Reconciled | null;
}

const politely = (message: string): CatalogueMessage => ({
  message,
  priority: "polite",
});

const assertively = (message: string): CatalogueMessage => ({
  message,
  priority: "assertive",
});

/**
 * What a ready state says. A failed refresh is its own assertive message,
 * unless the section is hidden (see `hidesSection`), which has no list to say
 * was kept. Anything else is one composed polite message (see
 * `announceCatalogueChange` for its order). The first list is not an update,
 * so "Layers updated" waits for a list that follows one; the skipped count is
 * said each time it changes to a count above zero, the first list included.
 */
function readyNotice({
  previous,
  next,
  awaited,
  change,
}: CatalogueNoticeInputs & {
  readonly next: ReadyState;
}): CatalogueMessage | null {
  const before = previous?.status === "ready" ? previous : null;
  if (next.refresh === "failed") {
    const hidden = hidesSection(
      catalogueView(next, awaited),
      next.layers.length,
    );
    return before?.refresh === "failed" || hidden
      ? null
      : assertively(describeLayersRefreshFailed());
  }
  const skipped = next.skipped.length;
  const message = announceCatalogueChange({
    turnedOff: change?.switchedOff.map(({ name }) => name) ?? [],
    linkUnavailable: awaited ? (change?.linkMissing ?? 0) : 0,
    skipped: skipped === (before?.skipped.length ?? 0) ? 0 : skipped,
    added: before ? (change?.added.length ?? 0) : 0,
    removed: before ? (change?.removed.length ?? 0) : 0,
    empty: awaited && before === null && next.layers.length === 0,
  });
  return message === null ? null : politely(message);
}

/**
 * The one message a catalogue transition makes, or null for silence. Each
 * state is said once, when it is entered: "Loading layers" only while a layer
 * named by the link is waiting, a failed load or refresh assertively and on
 * its own, and a new list as one composed message. Pure, so the hook can keep
 * it in its state and say it once from an effect.
 */
export function catalogueNotice(
  inputs: CatalogueNoticeInputs,
): CatalogueMessage | null {
  const { previous, next, linkWaiting } = inputs;
  switch (next.status) {
    case "loading":
      return previous?.status !== "loading" && linkWaiting > 0
        ? politely(describeLayersLoading())
        : null;
    case "failed":
      return previous?.status === "failed"
        ? null
        : assertively(describeLayersLoadFailed());
    case "ready":
      return readyNotice({ ...inputs, next });
  }
}
