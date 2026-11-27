// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

// The providers a page writes for search and Locate me, answering from a short
// list so the checks never reach the network. The check passes them to the map.
const PLACES = [
  {
    id: "one",
    label: "Cape Town",
    secondaryLabel: "South Africa",
    centre: { lat: -33.92, lng: 18.42 },
  },
  {
    id: "two",
    label: "Cairo",
    secondaryLabel: "Egypt",
    centre: { lat: 30.04, lng: 31.24 },
  },
];

window.sampleServices = {
  search: {
    search: async () => PLACES,
    reverse: async () => null,
  },
  location: {
    supportsWatch: false,
    locate: async () => ({
      position: { lat: -33.92, lng: 18.42 },
      accuracyMetres: 20,
      timestamp: Date.now(),
    }),
  },
};
