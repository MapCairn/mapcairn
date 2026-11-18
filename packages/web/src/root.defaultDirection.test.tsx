// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    Meta: () => null,
    Links: () => null,
    Scripts: () => null,
    ScrollRestoration: () => null,
  };
});

vi.mock("./i18n/hostLanguages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./i18n/hostLanguages")>();
  return {
    ...actual,
    DEFAULT_LANGUAGE: "ar",
    OFFERED_LANGUAGES: [
      { tag: "ar", label: "Arabic", direction: "rtl" },
      { tag: "en-GB", label: "English", direction: "rtl" },
    ],
  };
});

const { default: Root, Layout } = await import("./root");

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});

it("server-renders the host's right-to-left default without runtime locale data", () => {
  vi.stubGlobal("Intl", {});
  const html = renderToStaticMarkup(
    createElement(Layout, null, createElement("p", null, "content")),
  );
  expect(html).toContain('<html lang="ar" dir="rtl">');
});

it("keeps the fixed English page left-to-right even when the host overrides English", async () => {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: Root,
      children: [
        { index: true, Component: () => null, handle: { language: "en-GB" } },
      ],
    },
  ]);
  render(createElement(Stub, { initialEntries: ["/"] }));
  await waitFor(() => {
    expect(document.documentElement.lang).toBe("en-GB");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
