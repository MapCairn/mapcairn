// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolveTheme } from "./theme";
import { buildThemeBootstrapScript } from "./themeBootstrap";
import {
  LANGUAGE_STORAGE_KEY,
  MAP_SHAPE_ATTRIBUTE,
  PROJECTION_STORAGE_KEY,
  THEME_ATTRIBUTE,
  THEME_COLOR_META,
  THEME_COLOR_META_NAME,
  THEME_STORAGE_KEY,
} from "./themeConstants";

type Stored = string | null | "throws";
type System = "light" | "dark" | "missing" | "throws";

interface FakeMeta {
  name: string;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

function makeMeta(): FakeMeta {
  const meta: FakeMeta = {
    name: "",
    attributes: {},
    setAttribute(name, value) {
      meta.attributes[name] = value;
    },
  };
  return meta;
}

interface Run {
  attributes: Record<string, string>;
  lang: string | undefined;
  colorScheme: string | undefined;
  metas: FakeMeta[];
  queriedSelector: string | undefined;
  readKey: string | undefined;
  queriedMedia: string | undefined;
}

function run(
  stored: Stored,
  system: System,
  options: {
    existingMetas?: number;
    documentThrows?: boolean;
    /** What the map shape key holds. */
    projection?: string | null;
    /** What the language key holds. */
    language?: string | null;
    /** The tags passed to the script builder. */
    offered?: readonly string[];
  } = {},
): Run {
  const result: Run = {
    attributes: {},
    lang: undefined,
    colorScheme: undefined,
    metas: Array.from({ length: options.existingMetas ?? 0 }, makeMeta),
    queriedSelector: undefined,
    readKey: undefined,
    queriedMedia: undefined,
  };
  const root = {
    setAttribute(name: string, value: string) {
      result.attributes[name] = value;
    },
    set lang(value: string) {
      result.lang = value;
    },
    style: {
      set colorScheme(value: string) {
        result.colorScheme = value;
      },
    },
  };
  const document = {
    documentElement: root,
    head: {
      appendChild(node: FakeMeta) {
        result.metas.push(node);
      },
    },
    querySelectorAll(selector: string) {
      result.queriedSelector = selector;
      return [...result.metas];
    },
    createElement(tag: string) {
      expect(tag).toBe("meta");
      return makeMeta();
    },
  };
  const sandbox: Record<string, unknown> = {};
  if (options.documentThrows) {
    Object.defineProperty(sandbox, "document", {
      get() {
        throw new Error("blocked");
      },
    });
  } else {
    sandbox.document = document;
  }
  if (stored === "throws") {
    Object.defineProperty(sandbox, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
  } else {
    sandbox.localStorage = {
      getItem(key: string) {
        result.readKey ??= key;
        if (key === PROJECTION_STORAGE_KEY) {
          return options.projection ?? null;
        }
        if (key === LANGUAGE_STORAGE_KEY) {
          return options.language ?? null;
        }
        return stored;
      },
    };
  }
  if (system === "throws") {
    sandbox.matchMedia = () => {
      throw new Error("blocked");
    };
  } else if (system !== "missing") {
    sandbox.matchMedia = (query: string) => {
      result.queriedMedia = query;
      return { matches: system === "dark" };
    };
  }
  runInNewContext(buildThemeBootstrapScript(options.offered), sandbox);
  return result;
}

const storedValues: Stored[] = [
  null,
  "system",
  "light",
  "dark",
  "garbage",
  '"dark"',
  "throws",
];
const systemValues: System[] = ["light", "dark", "missing", "throws"];

describe("buildThemeBootstrapScript", () => {
  for (const stored of storedValues) {
    for (const system of systemValues) {
      it(`matches the pure resolver for stored ${String(stored)} and system ${system}`, () => {
        const storedChoice =
          stored === "throws" || stored === null ? undefined : stored;
        const systemTheme = system === "dark" ? "dark" : "light";
        const expected = resolveTheme(
          parseThemeChoice(storedChoice),
          systemTheme,
        );
        const result = run(stored, system);
        expect(result.attributes[THEME_ATTRIBUTE]).toBe(expected);
        expect(result.colorScheme).toBe(expected);
        expect(result.metas).toHaveLength(1);
        expect(result.metas[0]?.name).toBe(THEME_COLOR_META_NAME);
        expect(result.metas[0]?.attributes.content).toBe(
          THEME_COLOR_META[expected],
        );
      });
    }
  }

  it("reads the shared storage key and the dark scheme query", () => {
    const result = run("dark", "light");
    expect(result.readKey).toBe(THEME_STORAGE_KEY);
    expect(result.queriedMedia).toBe("(prefers-color-scheme: dark)");
    expect(result.queriedSelector).toBe(
      `meta[name="${THEME_COLOR_META_NAME}"]`,
    );
  });

  it("updates an existing theme-color tag instead of adding another", () => {
    const result = run("light", "dark", { existingMetas: 1 });
    expect(result.metas).toHaveLength(1);
    expect(result.metas[0]?.name).toBe("");
    expect(result.metas[0]?.attributes.content).toBe(THEME_COLOR_META.light);
  });

  it("updates every theme-color tag, so an explicit theme beats the OS on media-specific tags", () => {
    const light = run("light", "dark", { existingMetas: 2 });
    expect(light.metas).toHaveLength(2);
    for (const meta of light.metas) {
      expect(meta.attributes.content).toBe(THEME_COLOR_META.light);
    }
    const dark = run("dark", "light", { existingMetas: 2 });
    expect(dark.metas).toHaveLength(2);
    for (const meta of dark.metas) {
      expect(meta.attributes.content).toBe(THEME_COLOR_META.dark);
    }
  });

  it("marks a stored globe on the root, so the placeholder paints the space around it", () => {
    const globe = run("dark", "light", { projection: JSON.stringify("globe") });
    expect(globe.attributes[MAP_SHAPE_ATTRIBUTE]).toBe("globe");
    expect(globe.attributes[THEME_ATTRIBUTE]).toBe("dark");
  });

  it("marks nothing for a flat map, no setting or anything else stored", () => {
    for (const projection of [JSON.stringify("flat"), null, "globe", "{"]) {
      const result = run("light", "light", { projection });
      expect(result.attributes, String(projection)).not.toHaveProperty(
        MAP_SHAPE_ATTRIBUTE,
      );
    }
  });

  it("sets lang to a stored language the host offers", () => {
    const offered = ["en-GB", "af"];
    expect(run("light", "light", { language: '"af"', offered }).lang).toBe(
      "af",
    );
    expect(run("light", "light", { language: '"en-GB"', offered }).lang).toBe(
      "en-GB",
    );
  });

  it("leaves lang alone for no stored language, an unoffered or invalid one, or no offered list", () => {
    const offered = ["en-GB", "af"];
    for (const language of [null, '"fr"', "af", "{", "null", '"AF"']) {
      expect(
        run("light", "light", { language, offered }).lang,
        String(language),
      ).toBeUndefined();
    }
    expect(run("light", "light", { language: '"af"' }).lang).toBeUndefined();
    expect(
      run("light", "light", { language: '"af"', offered: [] }).lang,
    ).toBeUndefined();
  });

  it("still sets the theme when the language key cannot be read", () => {
    const result = run("dark", "light", { language: "{", offered: ["af"] });
    expect(result.attributes[THEME_ATTRIBUTE]).toBe("dark");
  });

  it("never throws when the document is blocked", () => {
    expect(() => run("dark", "dark", { documentThrows: true })).not.toThrow();
  });

  it("is deterministic and small", () => {
    const script = buildThemeBootstrapScript();
    expect(script).toBe(buildThemeBootstrapScript());
    expect(script).not.toContain("\n");
    expect(new TextEncoder().encode(script).length).toBeLessThan(1000);
    const withLanguages = buildThemeBootstrapScript(["en-GB", "af"]);
    expect(withLanguages).toBe(buildThemeBootstrapScript(["en-GB", "af"]));
    expect(new TextEncoder().encode(withLanguages).length).toBeLessThan(1200);
  });

  it("is built from the shared constants", () => {
    const script = buildThemeBootstrapScript();
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain(THEME_ATTRIBUTE);
    expect(script).toContain(THEME_COLOR_META.light);
    expect(script).toContain(THEME_COLOR_META.dark);
    expect(script).toContain(PROJECTION_STORAGE_KEY);
    expect(buildThemeBootstrapScript(["af"])).toContain(LANGUAGE_STORAGE_KEY);
    expect(script).toContain(MAP_SHAPE_ATTRIBUTE);
  });
});
