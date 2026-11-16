// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { TourCard, type TourStep, type UseTour } from "@mapcairn/map";

/**
 * The reference host's tour steps. Their words are message keys, so the tour
 * card and the step announcement read them in the active language.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "layers",
    heading: "app.tour.layers.heading",
    text: "app.tour.layers.text",
    advance: { kind: "layer-on" },
    target: "map-options",
    side: "end",
  },
  {
    id: "map-shape",
    heading: "app.tour.mapShape.heading",
    text: "app.tour.mapShape.text",
    advance: { kind: "projection-changed" },
    target: "settings",
    side: "end",
  },
  {
    id: "search",
    heading: "app.tour.search.heading",
    text: "app.tour.search.text",
    advance: { kind: "surface", surface: "search" },
    target: "search",
    side: "start",
  },
];

/** Props for {@link AppTour}. */
export interface AppTourProps {
  readonly tour: UseTour;
}

/** The first-visit tour card with the reference host's words, as keys. */
export function AppTour({ tour }: AppTourProps) {
  return (
    <TourCard
      tour={tour}
      welcome={{
        heading: "app.tour.welcome.heading",
        text: "app.tour.welcome.text",
        announcement: "app.tour.welcome.announcement",
      }}
      ending={{
        heading: "app.tour.ending.heading",
        text: "app.tour.ending.text",
      }}
    />
  );
}
