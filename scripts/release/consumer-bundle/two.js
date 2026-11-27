// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mountMap } from "./mapcairn/browser.js";

// The consumer check drives the maps from the page, after it has counted what
// the page holds.
window.mountMap = mountMap;
