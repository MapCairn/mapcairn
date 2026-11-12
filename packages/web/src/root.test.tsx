import { createFakeServices, THEME_COLOR_META } from "@mapcairn/core";
import { useServices } from "@mapcairn/map";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_BOOTSTRAP_SCRIPT } from "./app/themeBootstrap";

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

const fakeServices = createFakeServices();
const createServices = vi.fn(() => fakeServices);
vi.mock("./composition/createServices", () => ({
  createServices: () => createServices(),
}));

const reportCaughtError = vi.fn();
vi.mock("./composition/errorReporting", () => ({
  reportCaughtError: (error: unknown) => reportCaughtError(error),
}));

const {
  default: Root,
  Layout,
  links,
  meta,
  ErrorBoundary,
} = await import("./root");

afterEach(() => {
  vi.restoreAllMocks();
  reportCaughtError.mockClear();
});

type Link = Record<string, string>;
const allLinks = (): Link[] =>
  links().map((link) =>
    Object.fromEntries(
      Object.entries(link).map(([key, value]) => [key, String(value)]),
    ),
  );

describe("root links", () => {
  it("preloads the Latin font face and nothing else", () => {
    const preloads = allLinks().filter((link) => link.rel === "preload");
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toMatchObject({
      as: "font",
      type: "font/woff2",
      crossOrigin: "anonymous",
    });
  });

  it("lists the favicons, touch icon, pinned-tab icon and manifest", () => {
    expect(allLinks()).toEqual(
      expect.arrayContaining([
        {
          rel: "icon",
          href: "/favicon.svg",
          type: "image/svg+xml",
          sizes: "any",
        },
        { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
        expect.objectContaining({ href: "/favicon-32x32.png", sizes: "32x32" }),
        expect.objectContaining({ href: "/favicon-16x16.png", sizes: "16x16" }),
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/apple-touch-icon.png",
        },
        {
          rel: "mask-icon",
          href: "/safari-pinned-tab.svg",
          color: "#0d70d4",
        },
        { rel: "manifest", href: "/site.webmanifest" },
      ]),
    );
  });

  it("preconnects to the default vector basemap's tile host only", () => {
    const preconnects = allLinks().filter((link) => link.rel === "preconnect");
    expect(preconnects.map((link) => link.href)).toEqual([
      "https://tiles.openfreemap.org",
    ]);
  });

  it("makes the tile host preconnect a CORS one, as MapLibre fetches with CORS", () => {
    const preconnects = allLinks().filter((link) => link.rel === "preconnect");
    expect(preconnects).toEqual([
      expect.objectContaining({ crossOrigin: "anonymous" }),
    ]);
  });

  it("leaves the canonical link to each route and stylesheets to the bundler", () => {
    const rels = allLinks().map((link) => link.rel);
    expect(rels).not.toContain("canonical");
    expect(rels).not.toContain("stylesheet");
  });
});

describe("root meta", () => {
  it("sets the title, description and a viewport that allows zoom", () => {
    const tags = meta({} as never);

    expect(tags).toContainEqual({ title: "MapCairn | Interactive map" });
    expect(tags).toContainEqual(
      expect.objectContaining({ name: "description" }),
    );
    expect(tags).toContainEqual({
      name: "viewport",
      content: "width=device-width, initial-scale=1, viewport-fit=cover",
    });
  });

  it("sets Open Graph and Twitter card tags with a British English locale", () => {
    const tags = meta({} as never);

    expect(tags).toContainEqual({
      property: "og:site_name",
      content: "MapCairn",
    });
    expect(tags).toContainEqual({ property: "og:locale", content: "en_GB" });
    expect(tags).toContainEqual({
      property: "og:image",
      content: "https://mapcairn.timothybrits.co.za/og-image.png",
    });
    expect(tags).toContainEqual({
      name: "twitter:card",
      content: "summary_large_image",
    });
  });
});

describe("root Layout", () => {
  const markup = () =>
    renderToStaticMarkup(
      createElement(Layout, null, createElement("p", null, "app content")),
    );

  it("renders a British English document around its children", () => {
    expect(markup()).toContain('<html lang="en-GB">');
    expect(markup()).toContain("app content");
  });

  it("tints the browser for each colour scheme and for Windows tiles", () => {
    const html = markup();
    expect(html).toContain(
      `<meta name="theme-color" content="${THEME_COLOR_META.light}" media="(prefers-color-scheme: light)"/>`,
    );
    expect(html).toContain(
      `<meta name="theme-color" content="${THEME_COLOR_META.dark}" media="(prefers-color-scheme: dark)"/>`,
    );
    expect(html).toContain(
      '<meta name="msapplication-TileColor" content="#0d70d4"/>',
    );
    expect(html).toContain(
      '<meta name="msapplication-config" content="/browserconfig.xml"/>',
    );
  });

  it("inlines the theme script exactly, and no style attribute", () => {
    const html = markup();
    expect(html).toContain(`<script>${THEME_BOOTSTRAP_SCRIPT}</script>`);
    expect(html).not.toMatch(/style=/);
  });
});

describe("root Root", () => {
  function ServicesProbe() {
    return createElement(
      "p",
      null,
      useServices() === fakeServices ? "services ready" : "wrong services",
    );
  }

  it("provides the services, built once, to the matched route", () => {
    createServices.mockClear();
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: Root,
        children: [{ index: true, Component: ServicesProbe }],
      },
    ]);

    const { rerender } = render(createElement(Stub, { initialEntries: ["/"] }));
    rerender(createElement(Stub, { initialEntries: ["/"] }));

    expect(screen.getByText("services ready")).toBeInTheDocument();
    expect(createServices).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("live-region-polite")).toBeInTheDocument();
  });
});

describe("root ErrorBoundary", () => {
  it("explains a crash in plain English, offers Reload and reports the error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("kaboom at line 12");
    const Boom = () => {
      throw failure;
    };
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: Root,
        ErrorBoundary,
        children: [{ index: true, Component: Boom }],
      },
    ]);

    render(createElement(Stub, { initialEntries: ["/"] }));

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kaboom/)).toBeNull();
    expect(reportCaughtError).toHaveBeenCalledWith(failure);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  });

  it("logs and reports an error once, however often the boundary renders", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("kaboom once");
    const Boom = () => {
      throw failure;
    };
    // Renders the real boundary again, with the same error, on each click.
    const Rerendering = () => {
      const [renders, setRenders] = useState(0);
      return createElement(
        "div",
        null,
        createElement(
          "button",
          { type: "button", onClick: () => setRenders(renders + 1) },
          `Render again ${renders}`,
        ),
        createElement(ErrorBoundary),
      );
    };
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: Root,
        ErrorBoundary: Rerendering,
        children: [{ index: true, Component: Boom }],
      },
    ]);

    render(createElement(Stub, { initialEntries: ["/"] }));
    fireEvent.click(screen.getByRole("button", { name: /Render again 0/ }));
    fireEvent.click(screen.getByRole("button", { name: /Render again 1/ }));

    expect(
      screen.getByRole("button", { name: /Render again 2/ }),
    ).toBeVisible();
    const ofThisError = logged.mock.calls.filter(
      ([first]) => first === failure,
    );
    expect(ofThisError).toHaveLength(1);
    expect(reportCaughtError).toHaveBeenCalledTimes(1);
  });

  it("shows a not-found page for an unmatched route without reporting it", () => {
    const Stub = createRoutesStub([
      { path: "/", Component: Root, ErrorBoundary },
    ]);

    render(createElement(Stub, { initialEntries: ["/nowhere"] }));

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the map" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(reportCaughtError).not.toHaveBeenCalled();
  });
});
