import { runInNewContext } from "node:vm";
import {
  buildThemeBootstrapScript,
  type ResolvedTheme,
  resolveTheme,
  THEME_ATTRIBUTE,
  THEME_COLOR_META,
  THEME_COLOR_META_NAME,
  THEME_STORAGE_KEY,
} from "@karta/core";
import { runThemeSourceContract } from "@karta/core/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalStorageSettingsStore } from "../settings/LocalStorageSettingsStore";
import type { MediaQueryLike } from "../shared/mediaQuery";
import {
  BrowserThemeSource,
  type ThemeDocument,
  type ThemeMetaElement,
} from "./BrowserThemeSource";

/** A `MediaQueryList` that fires `change` when told to. */
class FakeMediaQuery implements MediaQueryLike {
  matches: boolean;
  readonly #listeners = new Set<() => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: "change", listener: () => void): void {
    this.#listeners.add(listener);
  }
  removeEventListener(_type: "change", listener: () => void): void {
    this.#listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.#listeners.size;
  }
  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
}

function fakeWindow(query: MediaQueryLike | undefined) {
  return {
    matchMedia: vi.fn((_query: string) => query as MediaQueryList),
  };
}

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.documentElement.style.removeProperty("color-scheme");
  document.head
    .querySelector(`meta[name="${THEME_COLOR_META_NAME}"]`)
    ?.remove();
});

runThemeSourceContract("BrowserThemeSource", () => {
  const query = new FakeMediaQuery(false);
  const source = new BrowserThemeSource({
    getWindow: () => fakeWindow(query),
    getDocument: () => document as unknown as ThemeDocument,
  });
  return {
    source,
    controls: {
      setSystemTheme: (theme) => query.set(theme === "dark"),
      applied: () => {
        const value = document.documentElement.getAttribute(THEME_ATTRIBUTE);
        return value === "light" || value === "dark" ? value : null;
      },
    },
  };
});

describe("BrowserThemeSource", () => {
  it("asks for the dark colour scheme query", () => {
    const window = fakeWindow(new FakeMediaQuery(true));
    const source = new BrowserThemeSource({ getWindow: () => window });
    expect(source.getSystemTheme()).toBe("dark");
    expect(window.matchMedia).toHaveBeenCalledWith(
      "(prefers-color-scheme: dark)",
    );
  });

  it("is light when matchMedia is missing, returns nothing or throws", () => {
    for (const getWindow of [
      () => undefined,
      () => fakeWindow(undefined),
      () => ({
        matchMedia: () => {
          throw new Error("blocked");
        },
      }),
    ]) {
      const source = new BrowserThemeSource({ getWindow });
      expect(source.getSystemTheme()).toBe("light");
      expect(() => source.subscribe(() => undefined)()).not.toThrow();
    }
  });

  it("uses the global window and document by default", () => {
    const source = new BrowserThemeSource();
    expect(["light", "dark"]).toContain(source.getSystemTheme());
    source.apply("dark");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("notifies only when the theme really changes", () => {
    const query = new FakeMediaQuery(false);
    const source = new BrowserThemeSource({
      getWindow: () => fakeWindow(query),
    });
    const seen: ResolvedTheme[] = [];
    source.subscribe((theme) => seen.push(theme));
    query.set(false);
    query.set(true);
    query.set(true);
    query.set(false);
    expect(seen).toEqual(["dark", "light"]);
  });

  it("removes its listener when the subscriber leaves", () => {
    const query = new FakeMediaQuery(false);
    const source = new BrowserThemeSource({
      getWindow: () => fakeWindow(query),
    });
    const unsubscribe = source.subscribe(() => undefined);
    expect(query.listenerCount).toBe(1);
    unsubscribe();
    expect(query.listenerCount).toBe(0);
  });

  it("falls back to addListener on Safari before 14", () => {
    let handler: (() => void) | undefined;
    const removeListener = vi.fn();
    const legacy = {
      matches: false,
      addListener: (listener: () => void) => {
        handler = listener;
      },
      removeListener,
    } as unknown as MediaQueryLike;
    const source = new BrowserThemeSource({
      getWindow: () => fakeWindow(legacy),
    });
    const seen: ResolvedTheme[] = [];
    const unsubscribe = source.subscribe((theme) => seen.push(theme));
    (legacy as { matches: boolean }).matches = true;
    handler?.();
    expect(seen).toEqual(["dark"]);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(handler);
  });

  it("subscribes to nothing when the list supports neither listener API", () => {
    const source = new BrowserThemeSource({
      getWindow: () => fakeWindow({ matches: true }),
    });
    expect(() => source.subscribe(() => undefined)()).not.toThrow();
  });

  it("sets the attribute, the colour scheme and the theme-color meta tag", () => {
    const source = new BrowserThemeSource();
    source.apply("dark");
    const meta = document.head.querySelector(
      `meta[name="${THEME_COLOR_META_NAME}"]`,
    );
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(meta?.getAttribute("content")).toBe(THEME_COLOR_META.dark);
    source.apply("light");
    expect(meta?.getAttribute("content")).toBe(THEME_COLOR_META.light);
    expect(
      document.head.querySelectorAll(`meta[name="${THEME_COLOR_META_NAME}"]`),
    ).toHaveLength(1);
  });

  it("updates a theme-color tag the page already has", () => {
    const existing = document.createElement("meta");
    existing.name = THEME_COLOR_META_NAME;
    existing.content = "#000000";
    document.head.append(existing);
    new BrowserThemeSource().apply("light");
    expect(existing.getAttribute("content")).toBe(THEME_COLOR_META.light);
  });

  it("never throws when the document is missing or blocked", () => {
    expect(() =>
      new BrowserThemeSource({ getDocument: () => undefined }).apply("dark"),
    ).not.toThrow();
    expect(() =>
      new BrowserThemeSource({
        getDocument: () => {
          throw new Error("blocked");
        },
      }).apply("dark"),
    ).not.toThrow();
  });
});

type Stored = string | null | "throws";
type System = "light" | "dark" | "missing" | "throws";

interface FakeMeta extends ThemeMetaElement {
  attributes: Record<string, string>;
}

interface Result {
  attributes: Record<string, string>;
  colorScheme: string | undefined;
  meta: FakeMeta | null;
}

/** One fake page that both the inline script and the adapter can run against. */
function fakePage(stored: Stored, system: System) {
  const result: Result = { attributes: {}, colorScheme: undefined, meta: null };
  const makeMeta = (): FakeMeta => {
    const meta: FakeMeta = {
      name: "",
      attributes: {},
      setAttribute(name, value) {
        meta.attributes[name] = value;
      },
    };
    return meta;
  };
  const doc = {
    documentElement: {
      setAttribute(name: string, value: string) {
        result.attributes[name] = value;
      },
      style: {
        set colorScheme(value: string) {
          result.colorScheme = value;
        },
      },
    },
    head: {
      appendChild(node: FakeMeta) {
        result.meta = node;
      },
    },
    querySelector: () => result.meta,
    createElement: () => makeMeta(),
  };
  const matchMedia =
    system === "missing"
      ? undefined
      : (_query: string) => {
          if (system === "throws") {
            throw new Error("blocked");
          }
          return { matches: system === "dark" };
        };
  const storage = {
    getItem(key: string) {
      if (stored === "throws") {
        throw new Error("SecurityError");
      }
      return key === THEME_STORAGE_KEY ? stored : null;
    },
    setItem() {
      if (stored === "throws") {
        throw new Error("SecurityError");
      }
    },
    removeItem() {
      // The settings store's probe removes its key; there is nothing stored to remove.
    },
  };
  return { result, doc, matchMedia, storage };
}

const STORED: Stored[] = [
  null,
  "system",
  "light",
  "dark",
  "garbage",
  '"dark"',
  "throws",
];
const SYSTEMS: System[] = ["light", "dark", "missing", "throws"];

describe("parity with the inline pre-paint script", () => {
  for (const stored of STORED) {
    for (const system of SYSTEMS) {
      it(`yields the same page for stored ${String(stored)} and system ${system}`, () => {
        const script = fakePage(stored, system);
        const sandbox: Record<string, unknown> = {
          document: script.doc,
          matchMedia: script.matchMedia,
        };
        Object.defineProperty(sandbox, "localStorage", {
          get() {
            if (stored === "throws") {
              throw new Error("SecurityError");
            }
            return script.storage;
          },
        });
        runInNewContext(buildThemeBootstrapScript(), sandbox);

        const app = fakePage(stored, system);
        const source = new BrowserThemeSource({
          getWindow: () =>
            app.matchMedia
              ? ({ matchMedia: app.matchMedia } as never)
              : undefined,
          getDocument: () => app.doc as unknown as ThemeDocument,
        });
        const settings = new LocalStorageSettingsStore({
          getStorage: () => {
            if (stored === "throws") {
              throw new Error("SecurityError");
            }
            return app.storage as unknown as Storage;
          },
          events: undefined,
        });
        source.apply(
          resolveTheme(settings.get().theme, source.getSystemTheme()),
        );

        expect(app.result.attributes).toEqual(script.result.attributes);
        expect(app.result.colorScheme).toBe(script.result.colorScheme);
        expect(app.result.meta?.name).toBe(script.result.meta?.name);
        expect(app.result.meta?.attributes).toEqual(
          script.result.meta?.attributes,
        );
        expect(app.result.meta?.attributes.content).toBeDefined();
      });
    }
  }
});
