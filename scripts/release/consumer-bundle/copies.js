// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// Two copies of the bundle on one page, as two widgets that each ship their own
// would be: the check copies the files into a second folder, so every module,
// Lit among them, is loaded twice. Each mounts a map with Settings.
import { mountMap as mountFirst } from "./mapcairn/browser.js";
import { mountMap as mountSecond } from "./mapcairn-copy/browser.js";

mountFirst(document.getElementById("first"), {
  label: "First map",
  tools: ["settings"],
});
mountSecond(document.getElementById("second"), {
  label: "Second map",
  tools: ["settings"],
});
