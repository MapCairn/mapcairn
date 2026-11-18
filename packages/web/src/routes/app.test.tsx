// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createLanguageCatalogue,
  FakeMessageCatalogue,
} from "@mapcairn/core";
import { useServices } from "@mapcairn/map";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const fakeServices = createFakeServices();
const createServices = vi.fn(() => fakeServices);
vi.mock("../composition/createServices", () => ({
  createServices: () => createServices(),
}));

const { default: AppLayout } = await import("./app");

/** A route stub with the app layout around one page. */
function stub(page: () => null | ReturnType<typeof createElement>) {
  return createRoutesStub([
    {
      path: "/",
      Component: AppLayout,
      children: [{ path: "map", Component: page }],
    },
  ]);
}

describe("the app layout", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  it("provides the services, built once, the announcer and tooltips to the pages inside it", () => {
    createServices.mockClear();
    const Probe = () =>
      createElement(
        "p",
        null,
        useServices() === fakeServices ? "services ready" : "wrong services",
      );
    const Stub = stub(Probe);

    const { rerender } = render(
      createElement(Stub, { initialEntries: ["/map"] }),
    );
    rerender(createElement(Stub, { initialEntries: ["/map"] }));

    expect(screen.getByText("services ready")).toBeInTheDocument();
    expect(createServices).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("live-region-polite")).toBeInTheDocument();
  });

  it("sets lang on the document to the language in use", () => {
    createServices.mockReturnValueOnce(
      createFakeServices({
        messages: new FakeMessageCatalogue({ language: "en-GB" }),
      }),
    );
    render(
      createElement(
        stub(() => null),
        { initialEntries: ["/map"] },
      ),
    );
    expect(document.documentElement.lang).toBe("en-GB");
  });

  it("follows the language when the person's choice loads", async () => {
    const services = createFakeServices({
      messages: new FakeMessageCatalogue({ language: "en-GB" }),
      languages: createLanguageCatalogue(
        [
          { tag: "en-GB", label: "English" },
          { tag: "af", label: "Afrikaans" },
        ],
        "en-GB",
        (tag) => Promise.resolve(new FakeMessageCatalogue({ language: tag })),
      ),
    });
    services.fakes.settings.set({ language: "af" });
    createServices.mockReturnValueOnce(services);
    render(
      createElement(
        stub(() => null),
        { initialEntries: ["/map"] },
      ),
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("af"));
  });

  it("keeps direction in step with a loaded language and the host override", async () => {
    const services = createFakeServices({
      messages: new FakeMessageCatalogue({ language: "en-GB" }),
      languages: createLanguageCatalogue(
        [
          { tag: "en-GB", label: "English" },
          { tag: "ar", label: "Arabic", direction: "ltr" },
        ],
        "en-GB",
        (tag) => Promise.resolve(new FakeMessageCatalogue({ language: tag })),
      ),
    });
    document.documentElement.dir = "rtl";
    services.fakes.settings.set({ language: "ar" });
    createServices.mockReturnValueOnce(services);
    render(
      createElement(
        stub(() => null),
        { initialEntries: ["/map"] },
      ),
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("ar"));
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("uses right-to-left direction when a right-to-left language loads", async () => {
    const services = createFakeServices({
      messages: new FakeMessageCatalogue({ language: "en-GB" }),
      languages: createLanguageCatalogue(
        [
          { tag: "en-GB", label: "English" },
          { tag: "ar", label: "Arabic" },
        ],
        "en-GB",
        (tag) => Promise.resolve(new FakeMessageCatalogue({ language: tag })),
      ),
    });
    document.documentElement.dir = "ltr";
    services.fakes.settings.set({ language: "ar" });
    createServices.mockReturnValueOnce(services);
    render(
      createElement(
        stub(() => null),
        { initialEntries: ["/map"] },
      ),
    );
    await waitFor(() => expect(document.documentElement.lang).toBe("ar"));
    expect(document.documentElement.dir).toBe("rtl");
  });
});
