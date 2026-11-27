// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mountMap } from "/mapcairn/browser.js";

// The browser check calls it, once it has set the page's language and direction.
window.mountMap = mountMap;
