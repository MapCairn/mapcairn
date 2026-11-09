import {
  type ResolvedTheme,
  THEME_ATTRIBUTE,
  THEME_COLOR_META,
  THEME_COLOR_META_NAME,
  type ThemeSource,
} from "@karta/core";
import {
  defaultMediaQueryWindow,
  type MediaQueryWindow,
  observeMediaQuery,
  readMediaQuery,
} from "./mediaQuery";

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
  querySelector(selector: string): ThemeElement | null;
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
 *   creates or updates `<meta name="theme-color">`. A parity test runs the
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
      let meta = doc.querySelector(`meta[name="${THEME_COLOR_META_NAME}"]`);
      if (meta === null) {
        const created = doc.createElement("meta");
        created.name = THEME_COLOR_META_NAME;
        doc.head.appendChild(created);
        meta = created;
      }
      meta.setAttribute("content", THEME_COLOR_META[theme]);
    } catch {
      // A blocked document leaves the page as it was; there is nothing to report to the user.
    }
  }
}
