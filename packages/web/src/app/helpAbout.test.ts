// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE, FakeMessageCatalogue } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { AF_CATALOGUE } from "../i18n/af";
import { helpAbout } from "./helpAbout";

describe("helpAbout", () => {
  it("names the licence and links to the source repository", () => {
    const about = helpAbout(new FakeMessageCatalogue());
    expect(about.heading).toBe("About");
    expect(about.text).toBe(
      "This site is open source software, released under the AGPL-3.0 licence.",
    );
    expect(about.link.label).toBe("View the source code and licence on GitHub");
    expect(about.link.href).toBe("https://github.com/MapCairn/mapcairn");
  });

  it("asks the catalogue for each piece of text by key", () => {
    const messages = new FakeMessageCatalogue();
    helpAbout(messages);
    expect(messages.calls.map((call) => call.key)).toEqual([
      "host.about.heading",
      "host.about.text",
      "host.about.link",
    ]);
  });

  it("keeps the licence name and does not translate it", () => {
    expect(EN_GB_CATALOGUE["host.about.text"]).toContain("AGPL-3.0");
    expect(AF_CATALOGUE["host.about.text"]).toContain("AGPL-3.0");
  });
});
