// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { isMessageKey, resolveText, textOrMessage } from "./resolveText";

describe("resolveText", () => {
  it("looks a known key up in the active catalogue", () => {
    const catalogue = new FakeMessageCatalogue({
      overrides: { "settings.title": "Instellings" },
    });
    expect(resolveText(catalogue, "settings.title")).toBe("Instellings");
    expect(catalogue.calls).toEqual([{ key: "settings.title", params: {} }]);
  });

  it("returns a plain string unchanged without asking the catalogue", () => {
    const catalogue = new FakeMessageCatalogue();
    expect(resolveText(catalogue, "Earthquakes")).toBe("Earthquakes");
    expect(catalogue.calls).toEqual([]);
  });

  it("passes an unknown dotted string through", () => {
    const catalogue = new FakeMessageCatalogue();
    expect(resolveText(catalogue, "layer.nothing.name")).toBe(
      "layer.nothing.name",
    );
    expect(resolveText(catalogue, "constructor")).toBe("constructor");
    expect(resolveText(catalogue, "toString")).toBe("toString");
    expect(catalogue.calls).toEqual([]);
  });

  it("tells a key from a string", () => {
    expect(isMessageKey("settings.title")).toBe(true);
    expect(isMessageKey("Settings")).toBe(false);
    expect(isMessageKey("__proto__")).toBe(false);
  });
});

describe("textOrMessage", () => {
  it("turns a key into a message with no parameters, and leaves a plain string alone", () => {
    expect(textOrMessage("settings.title")).toEqual({
      key: "settings.title",
      params: {},
    });
    expect(textOrMessage("Earthquakes")).toBe("Earthquakes");
  });
});
