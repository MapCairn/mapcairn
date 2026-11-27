// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Lets TypeScript accept the `mapcairn-map` tag in JSX. A React project that
 * wants it adds one line in any file the project compiles:
 * `import "@mapcairn/sdk/browser/react-jsx";`. Load the element with
 * `import "@mapcairn/sdk/browser/element";` before the app renders, because
 * React sets an object as an attribute, which reads as text, on an element that
 * is not defined yet. Keep the objects you pass as `services`, `layers`,
 * `basemaps` and `languages` the same from one render to the next, because a
 * new one with other data draws the map again.
 * @packageDocumentation
 */
import type {
  MapCairnMapElement,
  MapCairnMapEventMap,
  MountMapOptions,
} from "./index";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "mapcairn-map": import("react").DetailedHTMLProps<
        import("react").HTMLAttributes<MapCairnMapElement>,
        MapCairnMapElement
      > & {
        /** The attributes of the element, as JSX takes them: a number may be written as text. */
        latitude?: number | string;
        longitude?: number | string;
        zoom?: number | string;
        bearing?: number | string;
        basemap?: string;
        /** A theme choice: `"light"`, `"dark"` or `"system"`. */
        theme?: MountMapOptions["theme"];
        label?: string;
        language?: string;
        /** The tool names, separated by spaces. */
        tools?: string;
        /** The properties of the element, which React sets on it once it is defined. */
        services?: MapCairnMapElement["services"];
        basemaps?: MapCairnMapElement["basemaps"];
        layers?: MapCairnMapElement["layers"];
        languages?: MapCairnMapElement["languages"];
        view?: MapCairnMapElement["view"];
        /** The element's events: React listens for the event named after `on`. */
        "onmapcairn-view-change"?: (
          event: MapCairnMapEventMap["mapcairn-view-change"],
        ) => void;
        "onmapcairn-click"?: (
          event: MapCairnMapEventMap["mapcairn-click"],
        ) => void;
        "onmapcairn-feature-tap"?: (
          event: MapCairnMapEventMap["mapcairn-feature-tap"],
        ) => void;
        "onmapcairn-error"?: (
          event: MapCairnMapEventMap["mapcairn-error"],
        ) => void;
      };
    }
  }
}
