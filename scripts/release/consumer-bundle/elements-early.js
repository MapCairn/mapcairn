// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

// Runs before the element is defined, as a framework that renders first does:
// the view is set on an element the browser does not know yet, after the zoom
// attribute its markup gave it.
document.getElementById("first").view = {
  center: { lat: 10, lng: 20 },
  zoom: 4,
  bearing: 0,
};
