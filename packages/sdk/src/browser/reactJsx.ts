// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Lets TypeScript accept `<mapcairn-map>` in JSX. A React project that wants
 * it adds one line, `import "@mapcairn/sdk/browser/react-jsx";`, in any
 * file the project compiles.
 * @packageDocumentation
 */
import type { MapCairnMapElement } from "./index";

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
        theme?: "light" | "dark" | "system";
        label?: string;
        language?: string;
        /** The tool names, separated by spaces. */
        tools?: string;
      };
    }
  }
}
