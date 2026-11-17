// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices, FakeMessageCatalogue } from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
import { render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AF_CATALOGUE } from "../i18n/af";
import * as hostLanguages from "../i18n/hostLanguages";
import { ErrorPage, type ErrorPageKind } from "./ErrorPage";

vi.mock("../i18n/hostLanguages", async (importOriginal) => {
  const original = await importOriginal<typeof hostLanguages>();
  return { ...original, loadLanguage: vi.fn(original.loadLanguage) };
});

function renderPage(
  kind: ErrorPageKind,
  services?: ReturnType<typeof createFakeServices>,
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () =>
        services ? (
          <ServicesProvider services={services}>
            <ErrorPage kind={kind} />
          </ServicesProvider>
        ) : (
          <ErrorPage kind={kind} />
        ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("ErrorPage", () => {
  it("asks for the not-found words by key", () => {
    const services = createFakeServices();
    renderPage("not-found", services);
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "app.error.notFound.title",
        "app.error.notFound.message",
        "app.error.notFound.link",
      ]),
    );
  });

  it("asks for the unexpected-error words and Reload by key", () => {
    const services = createFakeServices();
    renderPage("unexpected", services);
    expect(services.fakes.messages.calls.map((call) => call.key)).toEqual(
      expect.arrayContaining([
        "app.error.unexpected.title",
        "app.error.unexpected.message",
        "app.reload",
      ]),
    );
  });

  it("uses the host's catalogue when it has one", () => {
    const services = createFakeServices({
      messages: new FakeMessageCatalogue({
        overrides: { "app.error.notFound.title": "Nothing here" },
      }),
    });
    renderPage("not-found", services);
    expect(
      screen.getByRole("heading", { name: "Nothing here" }),
    ).toBeInTheDocument();
  });

  it("speaks English outside the services, as the root error boundary does", () => {
    renderPage("unexpected");
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

describe("ErrorPage language outside the services", () => {
  const AF_TITLE = AF_CATALOGUE["app.error.unexpected.title"];
  const AF_RELOAD = AF_CATALOGUE["app.reload"];

  function browserLanguages(languages: readonly string[]) {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en-GB";
    browserLanguages(["en-GB"]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows Afrikaans when Afrikaans is the stored choice", async () => {
    localStorage.setItem("mapcairn:language", JSON.stringify("af"));
    renderPage("unexpected");
    expect(
      await screen.findByRole("heading", { name: AF_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: AF_RELOAD })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("af");
  });

  it("shows Afrikaans for Automatic when the browser prefers it", async () => {
    browserLanguages(["af-ZA", "en-GB"]);
    renderPage("unexpected");
    expect(
      await screen.findByRole("heading", { name: AF_TITLE }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("af");
  });

  it("keeps English when English is chosen, whatever the browser prefers", async () => {
    localStorage.setItem("mapcairn:language", JSON.stringify("en-GB"));
    browserLanguages(["af"]);
    renderPage("unexpected");
    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(hostLanguages.loadLanguage).not.toHaveBeenCalledWith("af");
    expect(document.documentElement.lang).toBe("en-GB");
  });

  it("words the not-found page in Afrikaans too", async () => {
    localStorage.setItem("mapcairn:language", JSON.stringify("af"));
    renderPage("not-found");
    expect(
      await screen.findByRole("heading", {
        name: AF_CATALOGUE["app.error.notFound.title"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: AF_CATALOGUE["app.error.notFound.link"],
      }),
    ).toBeInTheDocument();
  });

  it("renders English when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderPage("unexpected");
    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
  });

  it.each(["not json", "42", "null", '{"a":1}', '"fr"'])(
    "renders English when storage holds %s",
    async (stored) => {
      localStorage.setItem("mapcairn:language", stored);
      renderPage("unexpected");
      expect(
        await screen.findByRole("heading", { name: "Something went wrong" }),
      ).toBeInTheDocument();
      expect(document.documentElement.lang).toBe("en-GB");
    },
  );

  it("renders English when the browser's languages cannot be read", async () => {
    vi.spyOn(navigator, "languages", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderPage("unexpected");
    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
  });

  it("falls back to English, and says so in lang, when the Afrikaans chunk fails", async () => {
    localStorage.setItem("mapcairn:language", JSON.stringify("af"));
    document.documentElement.lang = "af";
    vi.mocked(hostLanguages.loadLanguage).mockRejectedValueOnce(
      new Error("chunk missing"),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderPage("unexpected");
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en-GB");
    });
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to English when the load throws at once", async () => {
    localStorage.setItem("mapcairn:language", JSON.stringify("af"));
    vi.mocked(hostLanguages.loadLanguage).mockImplementationOnce(() => {
      throw new Error("no loader");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderPage("unexpected");
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en-GB");
    });
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
  });

  it("does not set state after it has unmounted", async () => {
    localStorage.setItem("mapcairn:language", JSON.stringify("af"));
    const Stub = createRoutesStub([
      { path: "/", Component: () => <ErrorPage kind="unexpected" /> },
    ]);
    const { unmount } = render(<Stub initialEntries={["/"]} />);
    unmount();
    await Promise.resolve();
    expect(document.documentElement.lang).toBe("en-GB");
  });
});
