// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createLanguageCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  FakeMessageCatalogue,
} from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
import { render, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AF_CATALOGUE } from "../i18n/af";
import { MAP_TITLE, PRIVACY_TITLE } from "../i18n/pageTitle";
import { DocumentTitle } from "./DocumentTitle";

const AFRIKAANS = createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE);

/** Renders the title component on a route with `handle`, inside `services`. */
function renderOn(
  services: ReturnType<typeof createFakeServices>,
  handle?: unknown,
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      handle,
      Component: () => (
        <ServicesProvider services={services}>
          <DocumentTitle />
        </ServicesProvider>
      ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

beforeEach(() => {
  document.title = "Server title";
});

afterEach(() => {
  document.title = "";
});

describe("DocumentTitle", () => {
  it("sets the English title of the page", () => {
    renderOn(
      createFakeServices({ messages: new FakeMessageCatalogue() }),
      PRIVACY_TITLE,
    );

    expect(document.title).toBe("Privacy policy | MapCairn");
  });

  it("sets the title in Afrikaans when that is the language in use", () => {
    renderOn(createFakeServices({ messages: AFRIKAANS }), PRIVACY_TITLE);

    expect(document.title).toBe("Privaatheidsbeleid | MapCairn");
  });

  it("puts the product name first on the map page", () => {
    renderOn(createFakeServices({ messages: AFRIKAANS }), MAP_TITLE);

    expect(document.title).toBe("MapCairn | Interaktiewe kaart");
  });

  it("leaves the title alone on a page that names none", () => {
    renderOn(createFakeServices({ messages: AFRIKAANS }));

    expect(document.title).toBe("Server title");
  });

  it("follows the language when the person's choice loads", async () => {
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
    renderOn(services, MAP_TITLE);
    expect(document.title).toBe("MapCairn | Interactive map");

    services.fakes.settings.set({ language: "af" });

    await waitFor(() =>
      expect(document.title).toBe("MapCairn | Interaktiewe kaart"),
    );
  });
});
