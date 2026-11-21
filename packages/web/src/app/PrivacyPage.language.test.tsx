// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createLanguageCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  FakeMessageCatalogue,
  type MessageCatalogue,
  type MessageKey,
} from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "../constants/siteConfig";
import { AF_CATALOGUE } from "../i18n/af";
import { PrivacyPage } from "./PrivacyPage";

const AFRIKAANS = createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE);

/** Renders the page with `messages` as the active catalogue. */
function renderIn(messages: MessageCatalogue): HTMLElement {
  const services = createFakeServices({ messages });
  return render(
    <ServicesProvider services={services}>
      <PrivacyPage />
    </ServicesProvider>,
  ).container;
}

/**
 * The shape of the page apart from its words: each element's name, and the
 * address, target and text of every link and code span. Two languages that
 * say the same thing in the same way produce the same list.
 */
function structure(container: HTMLElement): string[] {
  return [...container.querySelectorAll("*")].map((element) => {
    const name = element.tagName.toLowerCase();
    if (name === "a") {
      return `a ${element.getAttribute("href")} ${element.getAttribute("target")}`;
    }
    if (name === "code") {
      return `code ${element.textContent}`;
    }
    return name;
  });
}

describe("PrivacyPage in the active language", () => {
  it("asks the catalogue for every privacy key and no other text", () => {
    const messages = new FakeMessageCatalogue();
    renderIn(messages);

    const asked = new Set(messages.calls.map((call) => call.key));
    const privacyKeys = (Object.keys(EN_GB_CATALOGUE) as MessageKey[]).filter(
      (key) => key.startsWith("privacy."),
    );
    for (const key of privacyKeys) {
      expect(asked, key).toContain(key);
    }
  });

  it("shows what the catalogue gives for a key", () => {
    const container = renderIn(
      new FakeMessageCatalogue({
        overrides: { "privacy.cookies.heading": "Biscuits" },
      }),
    );

    expect(
      within(container).getByRole("heading", { name: "Biscuits", level: 2 }),
    ).toBeInTheDocument();
  });

  it("says the page in Afrikaans", () => {
    const container = renderIn(AFRIKAANS);
    const view = within(container);

    expect(
      view.getByRole("heading", { name: "Privaatheidsbeleid", level: 1 }),
    ).toBeInTheDocument();
    expect(view.getByText(/Laas opgedateer: \d{4}-\d{2}-\d{2}/)).toBeVisible();
    expect(
      view.getByRole("heading", { name: "Koekies", level: 2 }),
    ).toBeInTheDocument();
    expect(view.getByText(/stel geen koekies nie/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/The site sets no cookies/);
  });

  it("uses the reviewed terms", () => {
    const text = renderIn(AFRIKAANS).textContent ?? "";

    for (const term of [
      "Webanalise",
      "onopgevange fout",
      "verworpe belofte",
      "op die toer by jou eerste besoek gereageer het",
      "wanneer jy op die speld Soek adres op druk",
      "Wanneer jy 'n laag aanskakel",
      "as die verwyser",
      "jsDelivr-CDN",
    ]) {
      expect(text, term).toContain(term);
    }
    expect(text).not.toMatch(/onopgevangde|verwerpte|verwysingsadres/);
  });

  it("keeps the links, their targets and the code spans in Afrikaans", () => {
    const container = renderIn(AFRIKAANS);
    const view = within(container);

    const policy = view.getByRole("link", {
      name: /Cloudflare se eie privaatheidsbeleid/,
    });
    expect(policy).toHaveAttribute(
      "href",
      "https://www.cloudflare.com/privacypolicy/",
    );
    expect(policy).toHaveAttribute("target", "_blank");
    expect(policy).toHaveAccessibleName(/nuwe oortjie/);
    expect(
      view.getByRole("link", { name: "mapcairn@timothybrits.co.za" }),
    ).toHaveAttribute("href", "mailto:mapcairn@timothybrits.co.za");
    expect(view.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/MapCairn/mapcairn/issues",
    );
    expect(
      view.getByRole("link", { name: "Terug na die produkbladsy" }),
    ).toHaveAttribute("href", "/");
    expect(
      view.getByRole("link", { name: "Terug na die kaart" }),
    ).toHaveAttribute("href", "/map");
    expect(view.getByText("mapcairn:theme")).toBeInTheDocument();
    expect(view.getByText("mapcairn:tourSeen")).toBeInTheDocument();
  });

  it("has the same headings, paragraphs, links and code spans in both languages", () => {
    const english = structure(renderIn(new FakeMessageCatalogue()));
    cleanup();
    const afrikaans = structure(renderIn(AFRIKAANS));

    expect(afrikaans).toEqual(english);
    expect(english.filter((name) => name === "p").length).toBeGreaterThan(10);
  });

  it("names every provider, host name, number and address in Afrikaans that the English page does", () => {
    const text = renderIn(AFRIKAANS).textContent ?? "";

    for (const fact of [
      "OpenFreeMap",
      "OpenStreetMap Foundation",
      "Nominatim",
      "Photon",
      "komoot",
      "WebMCP",
      "Valhalla",
      "valhalla1.openstreetmap.de",
      "FOSSGIS",
      "hierdie webwerf se adres as die verwyser: net die webwerf se adres",
      "USGS",
      "NASA",
      "Global Imagery Browse Services",
      "GDACS",
      "jsDelivr",
      "Cloudflare Web Analytics",
      "static.cloudflareinsights.com",
      "cloudflareinsights.com",
      "11 m",
      `${SITE_URL}/`,
    ]) {
      expect(text, fact).toContain(fact);
    }
  });

  it("changes its words when the person chooses another language", async () => {
    const services = createFakeServices({
      messages: new FakeMessageCatalogue(),
      languages: createLanguageCatalogue(
        [
          { tag: "en-GB", label: "English" },
          { tag: "af", label: "Afrikaans" },
        ],
        "en-GB",
        (tag) => (tag === "af" ? AFRIKAANS : new FakeMessageCatalogue()),
      ),
    });
    render(
      <ServicesProvider services={services}>
        <PrivacyPage />
      </ServicesProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Privacy policy", level: 1 }),
    ).toBeInTheDocument();

    services.fakes.settings.set({ language: "af" });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Privaatheidsbeleid", level: 1 }),
      ).toBeInTheDocument(),
    );
  });
});
