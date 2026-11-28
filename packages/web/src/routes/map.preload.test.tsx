// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MapRoute from "./map";

// What a production server build is told the client's chunk is called.
vi.mock("virtual:mapcairn/elements-chunk", () => ({
  default: "/assets/js/elements-abc123.js",
}));

describe("map route server render, where the elements chunk is known", () => {
  it("asks the browser to fetch it beside the page's own scripts", () => {
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        <MapRoute />
      </ServicesProvider>,
    );

    expect(html).toMatch(
      /<link rel="modulepreload"[^>]* href="\/assets\/js\/elements-abc123\.js"/,
    );
  });
});
