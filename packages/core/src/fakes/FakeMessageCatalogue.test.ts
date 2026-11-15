// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { runMessageCatalogueContract } from "../contracts/messageCatalogue.contract";
import { FakeMessageCatalogue } from "./FakeMessageCatalogue";

runMessageCatalogueContract("FakeMessageCatalogue", {
  create: () => new FakeMessageCatalogue(),
  createMissingKey: (key) => new FakeMessageCatalogue({ missingKeys: [key] }),
});

describe("FakeMessageCatalogue", () => {
  it("defaults to en-GB", () => {
    expect(new FakeMessageCatalogue().language).toBe("en-GB");
  });

  it("takes a different language", () => {
    expect(new FakeMessageCatalogue({ language: "af" }).language).toBe("af");
  });

  it("records every t and plural call, in order, with its key and params", () => {
    const catalogue = new FakeMessageCatalogue();
    catalogue.t("settings.title", {});
    catalogue.plural("common.itemCount", { count: 2 });
    expect(catalogue.calls).toEqual([
      { key: "settings.title", params: {} },
      { key: "common.itemCount", params: { count: 2 } },
    ]);
  });

  it("scripts a placeholder mismatch through an override", () => {
    const catalogue = new FakeMessageCatalogue({
      overrides: { "settings.notSaved": "Has a {missing} token." },
    });
    expect(catalogue.t("settings.notSaved", {})).toBe("Has a {missing} token.");
  });

  it("list formats with Intl.ListFormat and needs no scripting", () => {
    const catalogue = new FakeMessageCatalogue({ language: "en-GB" });
    expect(catalogue.list(["A", "B"])).toBe(
      new Intl.ListFormat("en-GB", { type: "conjunction" }).format(["A", "B"]),
    );
  });
});
