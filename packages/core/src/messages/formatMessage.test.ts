// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { formatMessage, joinMessages, message } from "./formatMessage";
import { textOrMessage } from "./resolveText";

describe("message", () => {
  it("pairs a key with its parameters", () => {
    expect(message("announce.layerOn", { name: "Rain" })).toEqual({
      key: "announce.layerOn",
      params: { name: "Rain" },
    });
  });
});

describe("formatMessage", () => {
  it("looks a plain key up with t and its parameters", () => {
    const catalogue = new FakeMessageCatalogue();
    expect(
      formatMessage(catalogue, message("announce.layerOn", { name: "Rain" })),
    ).toBe("Rain is on.");
    expect(catalogue.calls).toEqual([
      { key: "announce.layerOn", params: { name: "Rain" } },
    ]);
  });

  it("looks a plural key up with plural, choosing the form from count", () => {
    const catalogue = new FakeMessageCatalogue();
    expect(
      formatMessage(catalogue, message("announce.searchResults", { count: 1 })),
    ).toBe("1 result");
    expect(
      formatMessage(catalogue, message("announce.searchResults", { count: 3 })),
    ).toBe("3 results");
  });

  it("formats a message held in a placeholder first, then the outer one", () => {
    const catalogue = new FakeMessageCatalogue();
    const text = formatMessage(
      catalogue,
      message("announce.locationFound", {
        accuracy: message("units.metre", { count: 25 }),
      }),
    );
    expect(text).toBe("Location found, accuracy about 25 metres");
    expect(catalogue.calls.map((call) => call.key)).toEqual([
      "units.metre",
      "announce.locationFound",
    ]);
  });

  it("formats numbers, dates and lists in the catalogue's language", () => {
    const german = new FakeMessageCatalogue({ language: "de" });
    expect(
      formatMessage(
        german,
        message("announce.layerLoaded", { name: "Quakes", count: 1234 }),
      ),
    ).toBe("Quakes: 1.234 shown on the map.");
    expect(
      formatMessage(
        german,
        message("format.day", { date: new Date("2026-11-11T00:00:00Z") }),
      ),
    ).toBe("11. November 2026");
    expect(
      formatMessage(
        german,
        message("announce.layersDidNotAnswer", { names: ["Rain", "Flood"] }),
      ),
    ).toBe("Rain und Flood did not answer.");
  });
});

describe("joinMessages", () => {
  const one = message("announce.imageSaved", {});
  const two = message("announce.noResults", {});
  const three = message("announce.pinCleared", {});

  it("is null for no parts and the part itself for one", () => {
    expect(joinMessages([], "common.followedBy")).toBeNull();
    expect(joinMessages([one], "common.followedBy")).toBe(one);
  });

  it("joins several parts in order with the key that places them", () => {
    const catalogue = new FakeMessageCatalogue();
    const joined = joinMessages([one, two, three], "common.followedBy");
    expect(joined && formatMessage(catalogue, joined)).toBe(
      "Map image saved. No results Pin removed",
    );
    const commas = joinMessages([one, two], "common.commaJoined");
    expect(commas && formatMessage(catalogue, commas)).toBe(
      "Map image saved., No results",
    );
  });
});

describe("formatMessage with a list that holds messages", () => {
  it("formats each message in a list placeholder, so a layer's keyed name is read in the language", () => {
    const catalogue = new FakeMessageCatalogue({
      overrides: { "layer.earthquakes.name": "Aardbewings" },
    });
    expect(
      formatMessage(
        catalogue,
        message("announce.layersDidNotAnswer", {
          names: [textOrMessage("layer.earthquakes.name"), "Rain"],
        }),
      ),
    ).toContain("Aardbewings and Rain");
  });
});
