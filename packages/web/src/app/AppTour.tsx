import { TourCard, type TourStep, type UseTour } from "@mapcairn/map";

/** The reference host's tour steps, with their words. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "layers",
    heading: "Turn on a layer",
    text: "Open Map options and turn on any layer under Layers.",
    advance: { kind: "layer-on" },
    target: "map-options",
    side: "end",
  },
  {
    id: "map-shape",
    heading: "Try the globe",
    text: "Open Settings and switch Map shape between Flat and Globe. Help, just below it, lists the keys and can start this tour again.",
    advance: { kind: "projection-changed" },
    target: "settings",
    side: "end",
  },
  {
    id: "search",
    heading: "Find a place",
    text: "Type a place name in Search and press Enter.",
    advance: { kind: "surface", surface: "search" },
    target: "search",
    side: "start",
  },
];

const WELCOME = {
  heading: "New to MapCairn?",
  text: "Data such as earthquakes and fires is drawn only once you turn its layer on. This three-step tour shows how.",
  announcement:
    "New to MapCairn? A three-step tour is after the search box, with Take the tour and Skip.",
};

const ENDING = {
  heading: "Tour finished",
  text: "Help, in Settings, can start it again.",
};

/** Props for {@link AppTour}. */
export interface AppTourProps {
  readonly tour: UseTour;
}

/** The first-visit tour card with the reference host's words. */
export function AppTour({ tour }: AppTourProps) {
  return <TourCard tour={tour} welcome={WELCOME} ending={ENDING} />;
}
