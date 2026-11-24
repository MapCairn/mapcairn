// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import {
  THEME_STYLESHEET_FILE,
  themeStylesheetPlugin,
} from "./themeStylesheetPlugin";

const CSS = ".a { colour: red; }\n";

describe("themeStylesheetPlugin", () => {
  it("emits the stylesheet as a file in the build, so a strict policy allows it", () => {
    const emitFile = vi.fn();
    themeStylesheetPlugin(() => CSS).generateBundle.call({ emitFile });

    expect(emitFile).toHaveBeenCalledWith({
      type: "asset",
      fileName: THEME_STYLESHEET_FILE,
      source: CSS,
    });
  });

  it("links the file from the page's head, and writes no inline style", () => {
    const tags = themeStylesheetPlugin(() => CSS).transformIndexHtml();

    expect(tags).toEqual([
      {
        tag: "link",
        attrs: { rel: "stylesheet", href: `/${THEME_STYLESHEET_FILE}` },
        injectTo: "head",
      },
    ]);
  });

  it("serves the same file from the dev server", () => {
    let handler: (request: unknown, response: unknown) => void = () => {
      throw new Error("The plugin registered no handler.");
    };
    const use = vi.fn((path: string, next: typeof handler) => {
      handler = next;
      return path;
    });
    themeStylesheetPlugin(() => CSS).configureServer({ middlewares: { use } });
    const response = { setHeader: vi.fn(), end: vi.fn() };
    handler({}, response);

    expect(use.mock.calls[0]?.[0]).toBe(`/${THEME_STYLESHEET_FILE}`);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/css; charset=utf-8",
    );
    expect(response.end).toHaveBeenCalledWith(CSS);
  });
});
