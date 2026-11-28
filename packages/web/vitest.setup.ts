// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { configure } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { privateElements } from "../map/src/lit/privateElements";

// App tests start as a page that has run for a moment does, with the map's
// private elements loaded, so an announcement is spoken when it is made.
if (typeof window !== "undefined") {
  await privateElements.define();
}

// The first test in a file waits for App's lazy MapView import, which a loaded machine can take over a second to transform.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  window.history.replaceState(null, "", "/");
});
