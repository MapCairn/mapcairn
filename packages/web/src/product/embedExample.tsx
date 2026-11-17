// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/*
 * The embedding example the product page shows, from the first import on
 * (`EMBED_EXAMPLE_CODE` in `productContent.ts`). It is real code: typecheck
 * compiles it against the SDK's entry points and `embedExample.test.tsx`
 * renders it, so the page cannot show code that does not work. It names its
 * component `App`, as an app of your own would.
 */
import { BUILT_IN_BASEMAP_CATALOGUE, createFakeServices } from "@mapcairn/core";
import {
  LiveRegionProvider,
  MapView,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import { useState } from "react";

const START = { center: { lat: -33.92, lng: 18.42 }, zoom: 11, bearing: 0 };

export function App() {
  const [services] = useState(() => createFakeServices());
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <MapView
            initialView={START}
            basemap={BUILT_IN_BASEMAP_CATALOGUE.resolve("bright")}
          />
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}
