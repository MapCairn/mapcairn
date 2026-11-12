// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceTourSkipped,
  initialTourState,
  stepDone,
  type TourAdvance,
  type TourSnapshot,
  type TourState,
  tourReducer,
} from "@mapcairn/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { FocusName } from "../../chrome/focusRegistry";
import { useSettings } from "../../services";
import { useAnnounce } from "../../ui/LiveRegion";

/** One step of a tour, as data. The host writes the words. */
export interface TourStep {
  /** A stable id, for the host's own wiring (for example "layers"). */
  readonly id: string;
  readonly heading: string;
  readonly text: string;
  /** What the person does to finish the step. */
  readonly advance: TourAdvance;
  /** The registered control to ring while the step is current, if any. */
  readonly target?: FocusName;
  /** In the panel layout, which side the card sits against. Defaults to start. */
  readonly side?: "start" | "end";
}

/** Options for {@link useTour}. */
export interface UseTourOptions {
  readonly steps: readonly TourStep[];
  /** The host's tour version, stored in `Settings.tourSeen` once answered. */
  readonly version: number;
  /** Whether to show the welcome card on this page load (`shouldOfferTour`). */
  readonly offer: boolean;
  /** The app state now, which decides when a step is done. */
  readonly snapshot: TourSnapshot;
}

/** What {@link useTour} returns. */
export interface UseTour {
  readonly state: TourState;
  readonly steps: readonly TourStep[];
  /** The current step while running, else null. */
  readonly step: TourStep | null;
  /** Grows each time the card's heading should take focus. */
  readonly focusRequest: number;
  /** Starts at the first step, from the welcome card or from Help. */
  start(): void;
  /** Goes to the next step, or to the ending after the last. */
  next(): void;
  /** Ends the tour from the welcome card or any step. */
  skip(): void;
  /** Closes the ending card. */
  close(): void;
}

/**
 * Runs the first-visit tour: the welcome card, the steps and the ending.
 *
 * @remarks A step advances when the person does what it asks, judged by
 *   `stepDone` against the snapshot taken when the step began, or on Next.
 *   An advance by doing announces the next step and leaves focus where it is;
 *   Next and start ask the card to focus its heading instead. Taking the
 *   tour, skipping it, or turning on a layer while the welcome card is up
 *   stores the version, so the tour is not offered again.
 */
export function useTour({
  steps,
  version,
  offer,
  snapshot,
}: UseTourOptions): UseTour {
  const [state, dispatch] = useReducer(tourReducer, initialTourState);
  const [focusRequest, setFocusRequest] = useState(0);
  const { update } = useSettings();
  const announce = useAnnounce();
  const stepAtStart = useRef<{ key: string; snapshot: TourSnapshot } | null>(
    null,
  );

  const markSeen = useCallback(() => {
    update({ tourSeen: version });
  }, [update, version]);

  useEffect(() => {
    if (offer) {
      dispatch({ type: "offer" });
    }
  }, [offer]);

  const key = `${state.status}:${state.step}`;
  const { layersOn, projection, surface } = snapshot;
  useEffect(() => {
    const now = { layersOn, projection, surface };
    const atStart = stepAtStart.current;
    if (atStart === null || atStart.key !== key) {
      stepAtStart.current = { key, snapshot: now };
      return;
    }
    if (state.status === "welcome") {
      // Someone who turns a layer on unprompted has found what the tour is for.
      if (stepDone({ kind: "layer-on" }, atStart.snapshot, now)) {
        markSeen();
        dispatch({ type: "close" });
      }
      return;
    }
    if (state.status !== "running") {
      return;
    }
    const current = steps[state.step];
    if (current && stepDone(current.advance, atStart.snapshot, now)) {
      const following = steps[state.step + 1];
      announce(
        following
          ? `Step ${state.step + 2} of ${steps.length}, ${following.heading}. ${following.text}`
          : "Tour finished.",
      );
      dispatch({ type: "next" });
    }
  }, [key, state, steps, layersOn, projection, surface, announce, markSeen]);

  const start = useCallback(() => {
    markSeen();
    dispatch({ type: "start", steps: steps.length });
    setFocusRequest((count) => count + 1);
  }, [markSeen, steps.length]);

  const next = useCallback(() => {
    dispatch({ type: "next" });
    setFocusRequest((count) => count + 1);
  }, []);

  const skip = useCallback(() => {
    markSeen();
    dispatch({ type: "close" });
    announce(announceTourSkipped());
  }, [announce, markSeen]);

  const close = useCallback(() => {
    dispatch({ type: "close" });
  }, []);

  return {
    state,
    steps,
    step: state.status === "running" ? (steps[state.step] ?? null) : null,
    focusRequest,
    start,
    next,
    skip,
    close,
  };
}
