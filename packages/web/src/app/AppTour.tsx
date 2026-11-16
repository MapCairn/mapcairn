// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue } from "@mapcairn/core";
import {
  TourCard,
  type TourStep,
  type UseTour,
  useMessages,
} from "@mapcairn/map";

/** The reference host's tour steps, with their words from `messages`. */
export function tourSteps({ t }: MessageCatalogue): readonly TourStep[] {
  return [
    {
      id: "layers",
      heading: t("app.tour.layers.heading", {}),
      text: t("app.tour.layers.text", {}),
      advance: { kind: "layer-on" },
      target: "map-options",
      side: "end",
    },
    {
      id: "map-shape",
      heading: t("app.tour.mapShape.heading", {}),
      text: t("app.tour.mapShape.text", {}),
      advance: { kind: "projection-changed" },
      target: "settings",
      side: "end",
    },
    {
      id: "search",
      heading: t("app.tour.search.heading", {}),
      text: t("app.tour.search.text", {}),
      advance: { kind: "surface", surface: "search" },
      target: "search",
      side: "start",
    },
  ];
}

/** Props for {@link AppTour}. */
export interface AppTourProps {
  readonly tour: UseTour;
}

/** The first-visit tour card with the reference host's words. */
export function AppTour({ tour }: AppTourProps) {
  const { t } = useMessages();
  return (
    <TourCard
      tour={tour}
      welcome={{
        heading: t("app.tour.welcome.heading", {}),
        text: t("app.tour.welcome.text", {}),
        announcement: t("app.tour.welcome.announcement", {}),
      }}
      ending={{
        heading: t("app.tour.ending.heading", {}),
        text: t("app.tour.ending.text", {}),
      }}
    />
  );
}
