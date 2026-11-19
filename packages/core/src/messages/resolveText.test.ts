// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
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

describe("resolveText with a host key", () => {
  const source = { key: "host.layer.name", text: "Rivers" };

  it("uses the catalogue's translation of a host key", () => {
    const catalogue = new FakeMessageCatalogue({
      definitionTexts: { "host.layer.name": "Riviere" },
    });
    expect(resolveText(catalogue, source)).toBe("Riviere");
  });

  it("falls back to the source text when the host key has no translation", () => {
    expect(resolveText(new FakeMessageCatalogue(), source)).toBe("Rivers");
    const other = new FakeMessageCatalogue({
      definitionTexts: { "host.other": "Ander" },
    });
    expect(resolveText(other, source)).toBe("Rivers");
  });

  it("does not read an inherited property as a translation, and says nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const catalogue = new FakeMessageCatalogue({ definitionTexts: {} });
    expect(resolveText(catalogue, { key: "toString", text: "Source" })).toBe(
      "Source",
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns something that is not a text untouched", () => {
    const catalogue = new FakeMessageCatalogue();
    expect(resolveText(catalogue, null as never)).toBeNull();
    const half = { key: "host.layer.name" };
    expect(resolveText(catalogue, half as never)).toBe(half);
  });

  it("warns once for each blank key, and once for each catalogue", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const blank = { "host.a": "", "host.b": " " };
    const first = new FakeMessageCatalogue({ definitionTexts: blank });
    const second = new FakeMessageCatalogue({ definitionTexts: blank });
    for (const catalogue of [first, second]) {
      for (let pass = 0; pass < 2; pass += 1) {
        resolveText(catalogue, { key: "host.a", text: "A" });
        resolveText(catalogue, { key: "host.b", text: "B" });
      }
    }
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  it("falls back and warns once when a supplied translation is blank", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const catalogue = new FakeMessageCatalogue({
      definitionTexts: { "host.layer.name": "  " },
    });
    expect(resolveText(catalogue, source)).toBe("Rivers");
    expect(resolveText(catalogue, source)).toBe("Rivers");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("keeps a shipped key and a plain string working beside host keys", () => {
    const catalogue = new FakeMessageCatalogue({
      definitionTexts: { "settings.title": "Not used" },
      overrides: { "settings.title": "Instellings" },
    });
    expect(resolveText(catalogue, "settings.title")).toBe("Instellings");
    expect(resolveText(catalogue, "host.layer.name")).toBe("host.layer.name");
  });

  it("does not look a host key up through the typed catalogue", () => {
    const catalogue = new FakeMessageCatalogue({
      definitionTexts: { "host.layer.name": "Riviere" },
    });
    resolveText(catalogue, source);
    expect(catalogue.calls).toEqual([]);
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

  it("passes a host-keyed text through for the one place that speaks it", () => {
    const hostText = { key: "host.layer.name", text: "Rivers" };
    expect(textOrMessage(hostText)).toBe(hostText);
  });
});
