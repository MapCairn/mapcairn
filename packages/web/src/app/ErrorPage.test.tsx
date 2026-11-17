// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type MessageCatalogue,
} from "@mapcairn/core";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as storedLanguage from "../composition/storedLanguage";
import { AF_CATALOGUE } from "../i18n/af";
import * as hostLanguages from "../i18n/hostLanguages";
import { ErrorPage, type ErrorPageKind } from "./ErrorPage";

vi.mock("../i18n/hostLanguages", async (importOriginal) => {
  const original = await importOriginal<typeof hostLanguages>();
  return { ...original, loadLanguage: vi.fn(original.loadLanguage) };
});

vi.mock("../composition/storedLanguage", async (importOriginal) => {
  const original = await importOriginal<typeof storedLanguage>();
  return {
    ...original,
    resolveDeviceLanguage: vi.fn(original.resolveDeviceLanguage),
  };
});

function renderPage(kind: ErrorPageKind) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <ErrorPage kind={kind} /> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("ErrorPage", () => {
  it("says the page was not found and links back to the map", () => {
    renderPage("not-found");
    expect(
      screen.getByRole("heading", {
        name: EN_GB_CATALOGUE["app.error.notFound.title"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(EN_GB_CATALOGUE["app.error.notFound.message"]),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: EN_GB_CATALOGUE["app.error.notFound.link"],
      }),
    ).toHaveAttribute("href", "/");
  });

  it("says something went wrong and offers Reload", () => {
    renderPage("unexpected");
    expect(
      screen.getByRole("heading", {
        name: EN_GB_CATALOGUE["app.error.unexpected.title"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(EN_GB_CATALOGUE["app.error.unexpected.message"]),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: EN_GB_CATALOGUE["app.reload"] }),
    ).toBeInTheDocument();
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

  it("falls back to English, with one warning, when resolving the language throws", async () => {
    vi.mocked(storedLanguage.resolveDeviceLanguage).mockImplementationOnce(
      () => {
        throw new Error("cannot resolve");
      },
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderPage("unexpected");
    await waitFor(() => {
      expect(warn).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en-GB");
  });

  it("ignores a language that finishes loading after it has unmounted", async () => {
    let finish: (catalogue: MessageCatalogue) => void = () => {};
    vi.mocked(hostLanguages.loadLanguage).mockReturnValueOnce(
      new Promise<MessageCatalogue>((resolve) => {
        finish = resolve;
      }),
    );
    localStorage.setItem("mapcairn:language", JSON.stringify("af"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderPage("unexpected");
    unmount();
    await act(async () => {
      finish(createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE));
      await Promise.resolve();
    });
    expect(document.documentElement.lang).toBe("en-GB");
    expect(error).not.toHaveBeenCalled();
  });
});
