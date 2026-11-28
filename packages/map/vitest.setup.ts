// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import "@testing-library/jest-dom/vitest";
import { privateElements } from "./src/lit/privateElements";

// Component tests start as a page that has run for a moment does, with the
// private elements loaded. `privateElementsLoading.test.tsx` covers the render
// before that.
if (typeof window !== "undefined") {
  await privateElements.define();
}
