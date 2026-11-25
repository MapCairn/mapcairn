// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  checkMessageCatalogue,
  coordinateWordsFor,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  hemispheresFor,
  type MessageKey,
  parseCoordinates,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { AF_CATALOGUE } from "./af";

const KEYS = Object.keys(EN_GB_CATALOGUE) as MessageKey[];

/** The keys whose value is the same in both languages, and why that is right. */
const SAME_AS_ENGLISH: Partial<Record<MessageKey, string>> = {
  "common.followedBy": "Only placeholders and a space.",
  "common.commaJoined": "Only placeholders and a comma.",
  "common.dotJoined": "Only placeholders and a middle dot.",
  "format.hemisphereNorth": "The letter N is the same in Afrikaans.",
  "format.hemisphereSouth": "The letter S is the same in Afrikaans.",
  "format.hemisphereWest": "The letter W is the same in Afrikaans.",
  "units.symbol.metre": "The symbol m is the same in Afrikaans.",
  "units.symbol.kilometre": "The symbol km is the same in Afrikaans.",
  "units.symbol.foot": "The symbol ft is the same in Afrikaans.",
  "units.symbol.squareMetre": "The symbol m² is the same in Afrikaans.",
  "units.symbol.hectare": "The symbol ha is the same in Afrikaans.",
  "units.symbol.squareKilometre": "The symbol km² is the same in Afrikaans.",
  "units.symbol.squareFoot": "The symbol ft² is the same in Afrikaans.",
  "units.reading": "Only placeholders and a space.",
  "format.day": "Only a placeholder.",
  "format.utcTime": "A time and the UTC abbreviation, which stays as written.",
  "announce.layerStatus": "Only placeholders and a colon.",
  "announce.coordinateResult": "Only placeholders and a comma.",
  "draw.measure.radiusAndArea":
    "Radius is the Afrikaans word too; the rest is placeholders and a middle dot.",
  "draw.import.refusalWithDetail": "Only placeholders and a space.",
  "common.itemCount": "Item and items are spelled the same in both languages.",
  "chrome.readout.zoomShort": "The symbol z for the zoom level.",
  "duration.short.day": "The unit symbol d.",
  "duration.short.minute":
    "The unit abbreviation min is the same in Afrikaans.",
  "directions.stop": "Stop is the Afrikaans word too.",
  "tools.tour.stepAnnouncement": "Only placeholders and punctuation.",
  "tools.directions.stopPrefix": "Stop is the Afrikaans word too.",
  "layer.earthquakes.control.window.option.week":
    "Week is the Afrikaans word too.",
  "basemap.bright.name": "The name of a map style, kept as published.",
  "basemap.liberty.name": "The name of a map style, kept as published.",
  "basemap.colorful.name": "The name of a map style, kept as published.",
  "basemap.fiord.name": "The name of a map style, kept as published.",
  "basemap.positron.name": "The name of a map style, kept as published.",
  "keyHelp.keys.p": "The label on the P key.",
  "keyHelp.keys.i": "The label on the I key.",
  "keyHelp.keys.escape": "The label on the Escape key.",
  "keyHelp.keys.enter": "The label on the Enter key.",
  "host.map.keyInstruction": "Only placeholders and punctuation.",
  "host.map.named": "Only placeholders and brackets.",
  "host.map.announcement": "Only placeholders and a colon.",
  "privacy.contact.issuesLink": "The name of a service, kept as published.",
};

describe("the Afrikaans catalogue", () => {
  it("passes the catalogue check against English, with every allowance used", () => {
    expect(
      checkMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE, {
        sameAsEnglish: SAME_AS_ENGLISH,
      }),
    ).toEqual([]);
  });

  it("speaks to the visitor as jy, never with the formal u", () => {
    const formal = KEYS.filter((key) =>
      /(^|[^\p{L}'])u($|[^\p{L}])/iu.test(AF_CATALOGUE[key]),
    );
    expect(formal).toEqual([]);
  });

  it.each([
    ["English", EN_GB_CATALOGUE],
    ["Afrikaans", AF_CATALOGUE],
  ])(
    "starts the %s map key button's name with the words its chip shows",
    (_language, catalogue) => {
      const names = catalogue["layers.key.toggle"].split("|");
      const chips = catalogue["layers.key.chip"].split("|");
      expect(names.length).toBe(chips.length);
      names.forEach((name, index) => {
        expect(name.startsWith(chips[index] ?? "")).toBe(true);
      });
    },
  );

  it("calls the map key a legende, and leaves sleutel for keyboard keys", () => {
    const mapKeyKeys: MessageKey[] = [
      "layers.key.title",
      "layers.key.toggle",
      "layers.key.chip",
      "layers.key.scrolling",
      "layers.key.nameKey",
      "layers.keyFor",
    ];
    for (const key of mapKeyKeys) {
      expect(AF_CATALOGUE[key], key).toMatch(/[Ll]egende?s?\b/);
      expect(AF_CATALOGUE[key], key).not.toMatch(/sleutel/i);
    }
    expect(AF_CATALOGUE["layers.key.title"]).toBe("Kaartlegende");
    expect(AF_CATALOGUE["layers.key.showing"]).toBe("Wys tans {time}");
    expect(AF_CATALOGUE["layers.time.status"]).toMatch(/^Wys tans \{slot\}\./);
    expect(AF_CATALOGUE["duration.short.hour"]).toBe("{count} uur");
  });

  it("uses one term for each concept, not the variants it once had", () => {
    const variants: Array<[RegExp, string]> = [
      [/soekkassie/i, "soekbalk, for the search box"],
      [/roeteringsdiens/i, "roetediens, for the routing service"],
      [/vervoerwyse/i, "manier van reis, for the way of travelling"],
      [/ongeveer/i, "sowat, for about"],
      [/kaarteël/i, "kaartteël, for a map tile"],
      [/\bwel eël/i, "teël, for a tile"],
      [/kontrole/i, "beheer, for controls"],
      [/netnou/i, "oor 'n oomblik, for in a moment"],
      [/nog vir beelde/i, "nog op beelde, for waiting for imagery"],
      [/\b(in|na) kaartmiddel/i, "the article: in die kaartmiddel"],
      [/\btot kaartmiddel/i, "tot by die kaartmiddel"],
      [/\bParty dele/, "Sommige dele"],
      [/\bZoem \{level\}/, "Zoemvlak {level}"],
      [/Spring na kaart/, "Spring na die kaart"],
      [/\bLys die/, "Wys 'n lys van die"],
    ];
    for (const [pattern, use] of variants) {
      const found = KEYS.filter((key) => pattern.test(AF_CATALOGUE[key]));
      expect(found, `use ${use}`).toEqual([]);
    }
  });

  it("keeps UTC wherever the English says a time is in UTC", () => {
    const dropped = KEYS.filter(
      (key) =>
        EN_GB_CATALOGUE[key].includes("UTC") &&
        !AF_CATALOGUE[key].includes("UTC"),
    );
    expect(dropped).toEqual([]);
  });

  it("writes the unit symbols short, with the figure first and a space between", () => {
    expect(AF_CATALOGUE["units.reading"]).toBe("{number} {symbol}");
    expect([
      AF_CATALOGUE["units.symbol.mile"],
      AF_CATALOGUE["units.symbol.acre"],
      AF_CATALOGUE["units.symbol.squareMile"],
    ]).toEqual(["myl", "akker", "myl²"]);
  });

  it("reads the Afrikaans words for the directions and the degree, minute and second", () => {
    const words = coordinateWordsFor(
      createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE),
    );
    expect(
      parseCoordinates(
        "26 graad 12 minuut 14.8 sekonde suid 28 grade 2 minute 50.3 sekondes oos",
        hemispheresFor(
          createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE),
        ),
        words,
      ),
    ).toEqual({ lat: -26.2041111, lng: 28.0473056 });
  });

  it("writes east as O, for oos, and keeps N, S and W", () => {
    expect([
      AF_CATALOGUE["format.hemisphereNorth"],
      AF_CATALOGUE["format.hemisphereSouth"],
      AF_CATALOGUE["format.hemisphereEast"],
      AF_CATALOGUE["format.hemisphereWest"],
    ]).toEqual(["N", "S", "O", "W"]);
  });
});
