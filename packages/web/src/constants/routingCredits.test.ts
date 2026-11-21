// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { AF_CATALOGUE } from "../i18n/af";
import { routingCredits } from "./routingCredits";

const FIX_THE_MAP = "https://www.openstreetmap.org/fixthemap";

describe("routingCredits", () => {
  it("names OpenStreetMap and the service, and links to Fix the map with the given text", () => {
    const credits = routingCredits("Fix the map");
    expect(credits.map((credit) => credit.text)).toEqual([
      "© OpenStreetMap contributors",
      "Routing by Valhalla, run by FOSSGIS",
      "Fix the map",
    ]);
    expect(credits.find((credit) => credit.url === FIX_THE_MAP)?.text).toBe(
      "Fix the map",
    );
  });

  it("takes the Fix the map text from the catalogue in both languages", () => {
    expect(EN_GB_CATALOGUE["host.credits.fixTheMap"]).toBe("Fix the map");
    expect(AF_CATALOGUE["host.credits.fixTheMap"]).not.toBe(
      EN_GB_CATALOGUE["host.credits.fixTheMap"],
    );
  });
});
