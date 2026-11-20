// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { renderToString } from "react-dom/server";
import { App } from "./App.js";

/** What the check reads: the markup, and a token the page's CSS would use. */
export interface Rendered {
  readonly html: string;
  readonly fontFamily: string;
}

/** Renders the app to a string, as a server or a Worker does. */
export function render(): Rendered {
  return {
    html: renderToString(<App />),
    fontFamily: tokens.type.family,
  };
}
