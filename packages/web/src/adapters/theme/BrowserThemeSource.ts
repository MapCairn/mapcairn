// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ResolvedTheme,
  THEME_ATTRIBUTE,
  THEME_COLOR_META,
  THEME_COLOR_META_NAME,
  type ThemeSource,
} from "@mapcairn/core";
import {
  defaultMediaQueryWindow,
  type MediaQueryWindow,
  observeMediaQuery,
  readMediaQuery,
} from "../shared/mediaQuery";

/** The slice of a DOM element the theme adapter writes to. */
export interface ThemeElement {
  setAttribute(name: string, value: string): void;
}

/** The slice of a `<meta>` element the theme adapter writes to. */
export interface ThemeMetaElement extends ThemeElement {
  name: string;
}

/**
 * The slice of `document` the theme adapter uses. Deliberately the same calls
 * the inline pre-paint script makes, so the two cannot disagree.
 */
export interface ThemeDocument {
  readonly documentElement: ThemeElement & {
    readonly style: { colorScheme: string };
  };
  readonly head: { appendChild(node: ThemeMetaElement): unknown };
  querySelectorAll(selector: string): ArrayLike<ThemeElement>;
  createElement(tag: "meta"): ThemeMetaElement;
}

/** Options for {@link BrowserThemeSource}. */
export interface BrowserThemeSourceOptions {
  /** Returns the window that answers `matchMedia`. Called on every access. Defaults to `window`. */
  readonly getWindow?: () => MediaQueryWindow | undefined;
  /** Returns the document the theme is applied to. Called on every `apply`. Defaults to `document`. */
  readonly getDocument?: () => ThemeDocument | undefined;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function defaultDocument(): ThemeDocument | undefined {
  return typeof document === "undefined"
    ? undefined
    : (document as unknown as ThemeDocument);
}

/**
 * A {@link ThemeSource} over `matchMedia("(prefers-color-scheme: dark)")` and
 * the document.
 *
 * @remarks `getSystemTheme` is `light` when `matchMedia` is missing or throws,
 *   which is what the inline pre-paint script assumes too. `subscribe` uses
 *   the query's `change` event, falling back to `addListener` on Safari before
 *   14, and tells a listener only when the theme really changed.
 *
 *   `apply` mirrors the inline script in `root.tsx` exactly: it sets
 *   `data-theme` on the root element, sets its `color-scheme` style, and
 *   updates every `<meta name="theme-color">` (the page has one per colour
 *   scheme, and the browser uses the one whose media query matches the OS),
 *   or creates one if there is none. A parity test runs the
 *   script and this method against the same fake document. `apply` never
 *   throws, and never notifies subscribers.
 */
export class BrowserThemeSource implements ThemeSource {
  readonly #getWindow: () => MediaQueryWindow | undefined;
  readonly #getDocument: () => ThemeDocument | undefined;

  constructor(options: BrowserThemeSourceOptions = {}) {
    this.#getWindow = options.getWindow ?? defaultMediaQueryWindow;
    this.#getDocument = options.getDocument ?? defaultDocument;
  }

  getSystemTheme(): ResolvedTheme {
    return readMediaQuery(this.#getWindow, DARK_QUERY)?.matches
      ? "dark"
      : "light";
  }

  subscribe(listener: (theme: ResolvedTheme) => void): () => void {
    const list = readMediaQuery(this.#getWindow, DARK_QUERY);
    let last: ResolvedTheme = list?.matches ? "dark" : "light";
    let active = true;
    const stop = observeMediaQuery(list, () => {
      const next: ResolvedTheme = list?.matches ? "dark" : "light";
      if (active && next !== last) {
        last = next;
        listener(next);
      }
    });
    return () => {
      active = false;
      stop();
    };
  }

  apply(theme: ResolvedTheme): void {
    try {
      const doc = this.#getDocument();
      if (doc === undefined) {
        return;
      }
      const root = doc.documentElement;
      root.setAttribute(THEME_ATTRIBUTE, theme);
      root.style.colorScheme = theme;
      let metas = Array.from(
        doc.querySelectorAll(`meta[name="${THEME_COLOR_META_NAME}"]`),
      );
      if (metas.length === 0) {
        const created = doc.createElement("meta");
        created.name = THEME_COLOR_META_NAME;
        doc.head.appendChild(created);
        metas = [created];
      }
      for (const meta of metas) {
        meta.setAttribute("content", THEME_COLOR_META[theme]);
      }
    } catch {
      // A blocked document leaves the page as it was; there is nothing to report to the user.
    }
  }
}
