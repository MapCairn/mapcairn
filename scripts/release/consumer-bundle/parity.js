// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mountMap } from "./mapcairn/browser.js";

// A map with every tool, so the sheets, the search box and the list rows are on the page.
const search = {
  search: async () => [
    {
      id: "a",
      label: "Alpha",
      secondaryLabel: "Region",
      centre: { lat: 1, lng: 1 },
    },
  ],
  reverse: async () => null,
};
const location = { supportsWatch: false, locate: () => new Promise(() => {}) };
mountMap(document.getElementById("map"), {
  tools: ["search", "map-options", "measure", "locate", "settings"],
  services: { search, location },
});
