import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseThemeChoice, resolveTheme } from "./theme";
import { buildThemeBootstrapScript } from "./themeBootstrap";
import {
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
  } = {},
): Run {
  const result: Run = {
    attributes: {},
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
        result.readKey = key;
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
  runInNewContext(buildThemeBootstrapScript(), sandbox);
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

  it("never throws when the document is blocked", () => {
    expect(() => run("dark", "dark", { documentThrows: true })).not.toThrow();
  });

  it("is deterministic and small", () => {
    const script = buildThemeBootstrapScript();
    expect(script).toBe(buildThemeBootstrapScript());
    expect(script).not.toContain("\n");
    expect(new TextEncoder().encode(script).length).toBeLessThan(1000);
  });

  it("is built from the shared constants", () => {
    const script = buildThemeBootstrapScript();
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain(THEME_ATTRIBUTE);
    expect(script).toContain(THEME_COLOR_META.light);
    expect(script).toContain(THEME_COLOR_META.dark);
  });
});
