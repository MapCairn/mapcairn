// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// Loads the installed packages in plain Node, with no bundler and no
// conditions, and renders the chrome with them. Prints the markup.

import { createFakeServices } from "@mapcairn/core";
import {
  LiveRegionProvider,
  MapChrome,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import { tokens } from "@mapcairn/theme";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const html = renderToString(
  createElement(
    /** @type {any} */ (ServicesProvider),
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
process.stdout.write(JSON.stringify({ html, fontFamily: tokens.type.family }));
