// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE, type MessageKey } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { AF_CATALOGUE } from "./af";

const KEYS = Object.keys(EN_GB_CATALOGUE) as MessageKey[];

/** Every `{name}` placeholder in `form`, sorted and deduplicated. */
function placeholdersIn(form: string): string[] {
  return [
    ...new Set([...form.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "")),
  ].sort();
}

/** The keys whose value is the same in both languages, and why that is right. */
const SAME_AS_ENGLISH: Partial<Record<MessageKey, string>> = {
  "common.followedBy": "Only placeholders and a space.",
  "common.commaJoined": "Only placeholders and a comma.",
  "common.dotJoined": "Only placeholders and a middle dot.",
  "format.hemisphereNorth": "The letter N is the same in Afrikaans.",
  "format.hemisphereSouth": "The letter S is the same in Afrikaans.",
  "format.hemisphereWest": "The letter W is the same in Afrikaans.",
  "format.day": "Only a placeholder.",
  "format.utcTime": "A time and the UTC abbreviation, which stays as written.",
  "announce.layerStatus": "Only placeholders and a colon.",
  "announce.coordinateResult": "Only placeholders and a comma.",
  "draw.measure.radiusAndArea":
    "Radius is the Afrikaans word too; the rest is placeholders and a middle dot.",
  "draw.import.refusalWithDetail": "Only placeholders and a space.",
  "common.itemCount":
    "Item and items are Afrikaans words with the same plural form.",
  "chrome.readout.zoomShort": "The symbol z for the zoom level.",
  "duration.short.day": "The unit symbol d.",
  "duration.short.hour": "The unit symbol h.",
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
};

/**
 * The keys whose Afrikaans value is a copy of the English one and which are
 * not in `allowed`.
 */
function leftInEnglish(
  english: Record<string, string>,
  afrikaans: Record<string, string>,
  allowed: Record<string, string | undefined>,
): string[] {
  return Object.keys(english).filter(
    (key) => english[key] === afrikaans[key] && allowed[key] === undefined,
  );
}

describe("the check for Afrikaans left as English", () => {
  it("names a copied value that is not allowed", () => {
    expect(leftInEnglish({ a: "Close" }, { a: "Close" }, {})).toEqual(["a"]);
  });

  it("passes a translated value and an allowed copy", () => {
    expect(leftInEnglish({ a: "Close" }, { a: "Sluit" }, {})).toEqual([]);
    expect(leftInEnglish({ a: "N" }, { a: "N" }, { a: "A letter." })).toEqual(
      [],
    );
  });
});

describe("the Afrikaans catalogue", () => {
  it("has no value left as the English text, except the allowed keys", () => {
    expect(
      leftInEnglish(EN_GB_CATALOGUE, AF_CATALOGUE, SAME_AS_ENGLISH),
    ).toEqual([]);
  });

  it("allows only keys that are still the same, each with a reason", () => {
    for (const [key, reason] of Object.entries(SAME_AS_ENGLISH)) {
      expect(reason?.trim().length, key).toBeGreaterThan(0);
      expect(AF_CATALOGUE[key as MessageKey], key).toBe(
        EN_GB_CATALOGUE[key as MessageKey],
      );
    }
  });

  it("has exactly the keys of the English catalogue", () => {
    expect(Object.keys(AF_CATALOGUE).sort()).toEqual([...KEYS].sort());
  });

  it.each(KEYS)("%s has the English placeholders and plural forms", (key) => {
    const english = EN_GB_CATALOGUE[key].split("|");
    const afrikaans = AF_CATALOGUE[key].split("|");
    expect(afrikaans).toHaveLength(english.length);
    afrikaans.forEach((form, index) => {
      expect(form.trim().length).toBeGreaterThan(0);
      expect(placeholdersIn(form)).toEqual(
        placeholdersIn(english[index] ?? ""),
      );
    });
  });

  it("speaks to the visitor as jy, never with the formal u", () => {
    const formal = KEYS.filter((key) =>
      /(^|[^\p{L}'])u($|[^\p{L}])/iu.test(AF_CATALOGUE[key]),
    );
    expect(formal).toEqual([]);
  });

  it("keeps UTC wherever the English says a time is in UTC", () => {
    const dropped = KEYS.filter(
      (key) =>
        EN_GB_CATALOGUE[key].includes("UTC") &&
        !AF_CATALOGUE[key].includes("UTC"),
    );
    expect(dropped).toEqual([]);
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
