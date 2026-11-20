// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// Renders the chrome with the umbrella's providers around the component from
// `@mapcairn/map`, which an app that lists both does. If the umbrella had
// installed its own copy of `map` or `core`, the two would be different
// modules with different contexts, so the names would not be the same object
// and the page would not render. Prints the markup and what it compared.

import { createFakeServices as createFakeServicesOfCore } from "@mapcairn/core";
import { MapChrome } from "@mapcairn/map";
import {
  createFakeServices,
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
  MapChrome as UmbrellaMapChrome,
} from "@mapcairn/sdk";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const html = renderToString(
  createElement(
    ServicesProvider,
    { services: createFakeServices() },
    createElement(
      LiveRegionProvider,
      null,
      createElement(
        TooltipProvider,
        null,
        createElement(MapChrome, {
          background: createElement("div", null),
          modal: false,
        }),
      ),
    ),
  ),
);
process.stdout.write(
  JSON.stringify({
    html,
    sameChrome: UmbrellaMapChrome === MapChrome,
    sameServices: createFakeServices === createFakeServicesOfCore,
  }),
);
