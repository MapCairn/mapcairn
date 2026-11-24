// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, processVanillaFile } from "@vanilla-extract/integration";
import { beforeAll, describe, expect, it } from "vitest";
import { checkThemeContrast, type ThemeOverride } from "./checkThemeContrast";
import { compositeOver, parseColour, toHex } from "./contrast";
import {
  createThemeStylesheet,
  type ThemeStylesheet,
} from "./createThemeStylesheet";
import { surfaceBlurSupported, tokens } from "./tokens.css";
import * as tokenValues from "./tokenValues";
import { themeValues } from "./tokenValues";

const here = dirname(fileURLToPath(import.meta.url));

/** One rule of the generated sheet, with the at-rules around it. */
interface Rule {
  conditions: string[];
  selector: string;
  declarations: Record<string, string>;
}

/**
 * Reads the sheet the generator writes: one at-rule or selector per line
 * ending in `{`, one declaration per line, `}` alone. It reads that layout
 * only, which is the point: a change to it is a change to look at.
 */
function readRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const stack: string[] = [];
  let current: Rule | undefined;
  for (const raw of css.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    if (line.endsWith("{")) {
      const prelude = line.slice(0, -1).trim();
      if (prelude.startsWith("@")) {
        stack.push(prelude);
      } else {
        current = {
          conditions: [...stack],
          selector: prelude,
          declarations: {},
        };
        rules.push(current);
      }
    } else if (line === "}") {
      if (current) {
        current = undefined;
      } else {
        stack.pop();
      }
    } else if (current) {
      const [name, value] = line.replace(/;$/, "").split(/:\s*/);
      current.declarations[name ?? ""] = value ?? "";
    }
  }
  return rules;
}

/** The custom property name behind a `tokens.color` reference. */
function nameOf(reference: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(reference);
  return match?.[1] ?? "";
}

function passed(result: ThemeStylesheet): { css: string } {
  if (!result.ok) {
    const failing = result.findings.filter((finding) => !finding.passes);
    throw new Error(
      `refused: ${JSON.stringify({ failing, invalid: result.invalid, invalidScope: result.invalidScope })}`,
    );
  }
  return result;
}

const brand: ThemeOverride = {
  colour: {
    light: {
      accent: "#0b5c3a",
      accentTint: "#d9efe4",
    },
    dark: { accent: "#7fd9aa", accentTint: "#17382a" },
  },
};

const GUARDS = [
  "(not (prefers-contrast: more))",
  "(not (forced-colors: active))",
];
const guarded = (...extra: string[]): string =>
  `@media ${[...extra, ...GUARDS].join(" and ")}`;

describe("createThemeStylesheet", () => {
  it("returns the CSS and the findings for a passing override", () => {
    const result = createThemeStylesheet(brand, { scope: ".brand" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((finding) => finding.passes)).toBe(true);
    expect(result.css).toContain(".brand");
  });

  it("writes an empty stylesheet when no colour, font or shape is set", () => {
    expect(createThemeStylesheet({}, { scope: ".brand" })).toEqual(
      expect.objectContaining({ ok: true, css: "" }),
    );
    expect(createThemeStylesheet({ colour: {} }, { scope: ".brand" }).css).toBe(
      "",
    );
  });

  it("writes each theme's values into its own context, under the high-contrast guards", () => {
    const { css } = passed(createThemeStylesheet(brand, { scope: ".brand" }));
    const rules = readRules(css).filter(
      (rule) => !rule.conditions.some((c) => c.startsWith("@supports")),
    );
    const accent = nameOf(tokens.color.accent);

    expect(
      rules
        .filter((rule) => accent in rule.declarations)
        .map(({ selector, conditions, declarations }) => ({
          selector,
          conditions,
          accent: declarations[accent],
        })),
    ).toEqual([
      {
        selector: ':root[data-theme="light"] .brand',
        conditions: [guarded()],
        accent: "#0b5c3a",
      },
      {
        selector: ":root:not([data-theme]) .brand",
        conditions: [guarded("(not (prefers-color-scheme: dark))")],
        accent: "#0b5c3a",
      },
      {
        selector: ':root[data-theme="dark"] .brand',
        conditions: [guarded()],
        accent: "#7fd9aa",
      },
      {
        selector: ":root:not([data-theme]) .brand",
        conditions: [guarded("(prefers-color-scheme: dark)")],
        accent: "#7fd9aa",
      },
    ]);
  });

  it("puts every rule inside the guards, so high contrast and forced colours keep the SDK values", () => {
    const { css } = passed(createThemeStylesheet(brand, { scope: "#host" }));
    const rules = readRules(css);

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(
        rule.conditions.some((condition) =>
          GUARDS.every((guard) => condition.includes(guard)),
        ),
        rule.selector,
      ).toBe(true);
    }
  });

  it("does not let a role set for one theme reach the other", () => {
    const { css } = passed(
      createThemeStylesheet(
        { colour: { light: { accent: "#0b5c3a", accentTint: "#d9efe4" } } },
        { scope: ".brand" },
      ),
    );
    const accent = nameOf(tokens.color.accent);
    const setting = readRules(css).filter(
      (rule) => accent in rule.declarations,
    );

    expect(setting.map((rule) => rule.selector)).toEqual([
      ':root[data-theme="light"] .brand',
      ":root:not([data-theme]) .brand",
    ]);
    expect(setting.at(-1)?.conditions.join(" ")).toContain(
      "not (prefers-color-scheme: dark)",
    );
    expect(css).not.toContain('data-theme="dark"');
  });

  it("scopes two sheets independently", () => {
    const first = passed(createThemeStylesheet(brand, { scope: ".first" })).css;
    const second = passed(
      createThemeStylesheet(
        { colour: { light: { accent: "#7a3b00", accentTint: "#fbe6d2" } } },
        { scope: "#second" },
      ),
    ).css;

    expect(first).toContain(".first");
    expect(first).not.toContain("#second");
    expect(second).toContain("#second");
    expect(second).not.toContain(".first");
    expect(second).not.toContain("#0b5c3a");
  });

  it("raises the specificity for the root scope so link order does not matter", () => {
    const { css } = passed(createThemeStylesheet(brand, { scope: ":root" }));
    const selectors = new Set(readRules(css).map((rule) => rule.selector));

    expect(selectors).toEqual(
      new Set([
        ':root:root[data-theme="light"]',
        ':root:root[data-theme="dark"]',
        ":root:root:not([data-theme])",
      ]),
    );
  });

  it("writes a colour in a normalised form, with its alpha", () => {
    const { css } = passed(
      createThemeStylesheet(
        {
          colour: {
            light: {
              surface: "oklch(1 0 0 / 0.9)",
              hairline: "rgb(0 0 0 / 0.2)",
              accent: "rgb(11, 92, 58)",
            },
          },
        },
        { scope: ".brand" },
      ),
    );
    const values = readRules(css).flatMap((rule) =>
      Object.values(rule.declarations),
    );

    expect(values).toContain("#0b5c3a");
    expect(values).toContain("#ffffffe6");
    expect(values).toContain("#00000033");
  });

  describe("opaque surfaces", () => {
    const override: ThemeOverride = {
      colour: {
        light: { surface: "oklch(0.98 0.01 150 / 0.95)" },
        dark: { surface: "oklch(0.2 0.02 150 / 0.95)" },
      },
    };
    const rules = readRules(
      passed(createThemeStylesheet(override, { scope: ".brand" })).css,
    );
    const surface = nameOf(tokens.color.surface);
    const raised = nameOf(tokens.color.surfaceRaised);
    const inner = nameOf(tokens.color.focusRingInner);

    it("flattens the surface over the theme's page background", () => {
      const expected = toHex(
        compositeOver(
          toHex(parseColour("oklch(0.98 0.01 150 / 0.95)")),
          themeValues.light.colour.pageBackground,
        ),
      );
      const reduced = rules.find(
        (rule) =>
          rule.selector === ':root[data-theme="light"] .brand' &&
          rule.conditions.some((c) =>
            c.includes("prefers-reduced-transparency"),
          ),
      );

      expect(reduced?.declarations[surface]).toBe(expected);
      expect(reduced?.declarations[inner]).toBeUndefined();
      expect(expected).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("uses it where backdrop-filter is not supported", () => {
      const unsupported = rules.filter((rule) =>
        rule.conditions.some(
          (c) => c === `@supports not (${surfaceBlurSupported})`,
        ),
      );

      expect(unsupported).toHaveLength(4);
      for (const rule of unsupported) {
        expect(rule.declarations[surface]).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it("leaves the surface alone for a role the host did not set", () => {
      const reduced = rules.filter((rule) =>
        rule.conditions.some((c) => c.includes("prefers-reduced-transparency")),
      );

      expect(reduced.length).toBe(4);
      expect(reduced.every((rule) => !(raised in rule.declarations))).toBe(
        true,
      );
    });

    it("sets the inner focus ring to the opaque surface unless the host chose one", () => {
      const base = rules.find(
        (rule) =>
          rule.selector === ':root[data-theme="dark"] .brand' &&
          rule.conditions.length === 1 &&
          !rule.conditions[0]?.includes("color-scheme"),
      );
      const flattened = toHex(
        compositeOver(
          toHex(parseColour("oklch(0.2 0.02 150 / 0.95)")),
          themeValues.dark.colour.pageBackground,
        ),
      );

      expect(base?.declarations[inner]).toBe(flattened);

      const explicit = readRules(
        passed(
          createThemeStylesheet(
            {
              colour: {
                dark: {
                  surface: "oklch(0.2 0.02 150 / 0.95)",
                  focusRingInner: "#101010",
                },
              },
            },
            { scope: ".brand" },
          ),
        ).css,
      );
      expect(
        explicit.find((rule) => inner in rule.declarations)?.declarations[
          inner
        ],
      ).toBe("#101010");
    });
  });

  it("reports findings for the values it writes, not the values it was given", () => {
    const result = createThemeStylesheet(brand, { scope: ".brand" });
    const { css } = passed(result);
    const written = Object.assign(
      {},
      ...readRules(css)
        .filter((rule) => rule.selector.includes('"light"'))
        .map((rule) => rule.declarations),
    ) as Record<string, string>;
    const rewritten = checkThemeContrast({
      colour: {
        light: {
          accent: written[nameOf(tokens.color.accent)] ?? "",
          accentTint: written[nameOf(tokens.color.accentTint)] ?? "",
        },
        dark: brand.colour?.dark ?? {},
      },
    });

    expect(result.ok && result.findings).toEqual(rewritten.findings);
  });

  describe("a theme below WCAG 2.2 AA", () => {
    const weak: ThemeOverride = {
      colour: { light: { text: "#bbbbbb", accent: "#0b5c3a" } },
    };

    it("is refused with the findings and no CSS", () => {
      const result = createThemeStylesheet(weak, { scope: ".brand" });

      expect(result.ok).toBe(false);
      expect(result.css).toBeUndefined();
      if (result.ok) {
        return;
      }
      expect(result.invalidScope).toBe(false);
      expect(result.invalid).toEqual([]);
      expect(result.findings).toContainEqual(
        expect.objectContaining({ foreground: "text", passes: false }),
      );
    });

    it("is refused for a derived inner ring that fails", () => {
      const result = createThemeStylesheet(
        {
          colour: {
            light: {
              surface: "#101010",
              text: "#ffffff",
              textMuted: "#e0e0e0",
            },
          },
        },
        { scope: ".brand" },
      );

      expect(result.ok).toBe(false);
      expect(result.css).toBeUndefined();
    });
  });

  describe("an override that cannot be used", () => {
    const hostile = [
      "red; } body { display: none",
      "url(https://example.invalid/x)",
      "#fff } .x { color: red",
      "var(--other)",
      "expression(alert(1))",
      "oklch(0.5 0.2 30 / 0.5); }",
      "\\72 ed",
    ];

    it.each(hostile)("refuses the colour %s and writes no CSS", (value) => {
      const result = createThemeStylesheet(
        { colour: { light: { accent: value } } },
        { scope: ".brand" },
      );

      expect(result.ok).toBe(false);
      expect(result.css).toBeUndefined();
      if (!result.ok) {
        expect(result.invalid).toContainEqual(
          expect.objectContaining({ role: "accent", value }),
        );
      }
    });

    it("refuses an unknown role, an unknown key and a wrong shape", () => {
      for (const override of [
        { colour: { light: { chromeBorder: "#000000" } } },
        { colour: { light: { pageBackground: "#000000" } } },
        { spacing: { md: "8px" } },
        { colour: { sepia: {} } },
        { colour: [] },
        null,
        "dark",
      ]) {
        const result = createThemeStylesheet(override as ThemeOverride, {
          scope: ".brand",
        });

        expect(result.ok, JSON.stringify(override)).toBe(false);
        expect(result.css).toBeUndefined();
        expect(result.ok || result.invalid.length).toBeGreaterThan(0);
      }
    });

    it("skips a role set to undefined, as the check does", () => {
      const result = createThemeStylesheet(
        {
          colour: {
            light: {
              text: undefined,
              accent: "#0b5c3a",
              accentTint: "#d9efe4",
            },
          },
        },
        { scope: ".brand" },
      );

      expect(result.ok).toBe(true);
      expect(result.css).toContain("#0b5c3a");
    });

    it("refuses a tint that leaves a selected row's muted text and the switch edge below AA", () => {
      const result = createThemeStylesheet(
        { colour: { light: { accentTint: "#709080", accent: "#000000" } } },
        { scope: ".brand" },
      );

      expect(result.ok).toBe(false);
      expect(result.css).toBeUndefined();
      expect(
        !result.ok &&
          result.findings.filter(
            (finding) => !finding.passes && finding.background === "accentTint",
          ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ foreground: "textMuted" }),
          expect.objectContaining({ foreground: "controlBoundary" }),
        ]),
      );
    });

    it("refuses a translucent role that must be opaque", () => {
      const result = createThemeStylesheet(
        { colour: { light: { accent: "#0b5c3a80" } } },
        { scope: ".brand" },
      );

      expect(result.ok).toBe(false);
    });

    it("is total: an override that throws is refused, not thrown", () => {
      const reads = { count: 0 };
      const trap = {
        get colour(): never {
          reads.count += 1;
          throw new Error("boom");
        },
      };

      const result = createThemeStylesheet(trap as ThemeOverride, {
        scope: ".brand",
      });

      expect(result.ok).toBe(false);
      expect(result.css).toBeUndefined();
    });

    it("refuses a value that reads differently the second time, and writes nothing", () => {
      let reads = 0;
      const colour = {
        get accent(): string {
          reads += 1;
          return reads === 1 ? "#0b5c3a" : "red; } body { x: y";
        },
      };

      const result = createThemeStylesheet(
        { colour: { light: colour } } as ThemeOverride,
        { scope: ".brand" },
      );

      expect(result.ok).toBe(false);
      expect(result.css).toBeUndefined();
    });
  });

  describe("the scope", () => {
    it.each([".brand", "#host", ":root", ".brand-2", "#a_b"])(
      "accepts %s",
      (scope) => {
        expect(createThemeStylesheet(brand, { scope }).ok).toBe(true);
      },
    );

    it.each([
      "",
      ".a, .b",
      ".a .b",
      ".a > .b",
      ".a{}",
      ".a;",
      "body",
      "*",
      "[data-x]",
      ".a:hover",
      "html",
      ".a }",
      ".1a",
      "#",
      ".",
      ".a\\.b",
      ".a\n.b",
      "@import url(x)",
      ".é",
      ":root, body",
      "url(x)",
    ])("refuses %j", (scope) => {
      const result = createThemeStylesheet(brand, { scope });

      expect(result.ok).toBe(false);
      expect(result.css).toBeUndefined();
      expect(!result.ok && result.invalidScope).toBe(true);
    });

    it("refuses a scope that is not a string, or options that cannot be read", () => {
      for (const options of [
        { scope: 4 },
        { scope: undefined },
        {},
        null,
        undefined,
        {
          get scope(): never {
            throw new Error("boom");
          },
        },
      ]) {
        const result = createThemeStylesheet(
          brand,
          options as unknown as { scope: string },
        );

        expect(result.ok).toBe(false);
        expect(!result.ok && result.invalidScope).toBe(true);
      }
    });

    it("still reports the findings when only the scope is wrong", () => {
      const result = createThemeStylesheet(brand, { scope: "body" });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.findings.length).toBeGreaterThan(0);
    });
  });

  describe("fontFamily", () => {
    const familyName = nameOf(tokens.type.family);
    const brandFont = '"Brand Sans", system-ui, sans-serif';

    it("writes the family once for the scope, followed by the SDK's own stack", () => {
      const { css } = passed(
        createThemeStylesheet({ fontFamily: brandFont }, { scope: ".brand" }),
      );

      expect(readRules(css)).toEqual([
        {
          conditions: [],
          selector: ":root .brand",
          declarations: {
            [familyName]: `${brandFont}, ${tokenValues.fontFamily}`,
          },
        },
      ]);
    });

    it("raises the specificity for the root scope", () => {
      const { css } = passed(
        createThemeStylesheet({ fontFamily: brandFont }, { scope: ":root" }),
      );

      expect(readRules(css).map((rule) => rule.selector)).toEqual([
        ":root:root",
      ]);
    });

    it("is not held back for high contrast or forced colours", () => {
      const { css } = passed(
        createThemeStylesheet({ fontFamily: brandFont }, { scope: "#map" }),
      );

      expect(css).not.toContain("@media");
    });

    it("writes the list normalised, so spacing in the input cannot reach the sheet", () => {
      const { css } = passed(
        createThemeStylesheet(
          { fontFamily: "  Inter ,serif " },
          { scope: "#map" },
        ),
      );

      expect(readRules(css)[0]?.declarations[familyName]).toBe(
        `Inter, serif, ${tokenValues.fontFamily}`,
      );
    });

    it("writes only the colours when no font is given, and only the font when no colour is", () => {
      const colourOnly = passed(
        createThemeStylesheet(brand, { scope: "#map" }),
      );
      const fontOnly = passed(
        createThemeStylesheet({ fontFamily: brandFont }, { scope: "#map" }),
      );

      expect(colourOnly.css).not.toContain(familyName);
      expect(fontOnly.css).not.toContain(nameOf(tokens.color.accent));
      expect(fontOnly.css).not.toContain("accent");
    });

    it("writes the font beside the colours in one sheet", () => {
      const { css } = passed(
        createThemeStylesheet(
          { ...brand, fontFamily: brandFont },
          { scope: "#map" },
        ),
      );
      const rules = readRules(css);

      expect(
        rules.filter((rule) => familyName in rule.declarations),
      ).toHaveLength(1);
      expect(
        rules.some((rule) => nameOf(tokens.color.accent) in rule.declarations),
      ).toBe(true);
    });

    it("skips a font set to undefined", () => {
      expect(
        createThemeStylesheet({ fontFamily: undefined }, { scope: "#map" }),
      ).toEqual(expect.objectContaining({ ok: true, css: "" }));
    });

    it("does not change the contrast findings", () => {
      const withFont = createThemeStylesheet(
        { ...brand, fontFamily: brandFont },
        { scope: "#map" },
      );

      expect(withFont.findings.length).toBeGreaterThan(0);
      expect(withFont.findings).toEqual(
        createThemeStylesheet(brand, { scope: "#map" }).findings,
      );
    });

    const hostile = [
      "Inter; } body { display: none",
      "url(https://example.invalid/font.woff2)",
      "var(--brand-font)",
      "Inter /* x */",
      "Inter,\nserif",
      "Inter</style><script>alert(1)</script>",
      "Inter !important",
      '"\\72 ed"',
      "inherit",
    ];

    it.each(hostile)(
      "refuses %j, names the field and writes no CSS",
      (value) => {
        const result = createThemeStylesheet(
          { fontFamily: value },
          { scope: ".brand" },
        );

        expect(result.ok).toBe(false);
        expect(result.css).toBeUndefined();
        expect(!result.ok && result.invalid).toEqual([
          { theme: null, role: "fontFamily", value, reason: "unparseable" },
        ]);
      },
    );

    it("reports a value that is not a string as malformed", () => {
      const result = createThemeStylesheet({ fontFamily: 42 } as never, {
        scope: ".brand",
      });

      expect(!result.ok && result.invalid).toEqual([
        { theme: null, role: "fontFamily", value: 42, reason: "malformed" },
      ]);
    });

    it("reports a refused font together with a refused colour and scope", () => {
      const result = createThemeStylesheet(
        { fontFamily: "x;", colour: { light: { accent: "nope" } } },
        { scope: "body" },
      );

      expect(result.ok).toBe(false);
      expect(!result.ok && result.invalid.map((entry) => entry.role)).toEqual([
        "accent",
        "fontFamily",
      ]);
      expect(!result.ok && result.invalidScope).toBe(true);
    });

    it("lists no font when a refusal is only about colour", () => {
      const result = createThemeStylesheet(
        { fontFamily: brandFont, colour: { light: { accent: "#ffff00" } } },
        { scope: ".brand" },
      );

      expect(result.ok).toBe(false);
      expect(!result.ok && result.invalid).toEqual([]);
    });

    it("refuses a font whose getter throws, without throwing", () => {
      const override = {
        get fontFamily(): string {
          throw new Error("boom");
        },
      };

      expect(() =>
        createThemeStylesheet(override as ThemeOverride, { scope: ".brand" }),
      ).not.toThrow();
      expect(
        createThemeStylesheet(override as ThemeOverride, { scope: ".brand" })
          .ok,
      ).toBe(false);
    });
  });

  describe("custom property names", () => {
    let compiled = "";

    beforeAll(async () => {
      const filePath = resolve(here, "tokens.css.ts");
      const source = await compile({ filePath, cwd: resolve(here, "..") });
      compiled = await processVanillaFile({
        source: source.source,
        filePath,
        identOption: "debug",
        serializeVirtualCssPath: async ({ source: css }) => `/*css*/${css}\n`,
      });
    });

    it("writes only names that tokens.css declares", () => {
      const defaults = (theme: "light" | "dark"): Record<string, string> =>
        Object.fromEntries(
          roleNames.map((role) => [role, themeValues[theme].colour[role]]),
        );
      const { css } = passed(
        createThemeStylesheet(
          { colour: { light: defaults("light"), dark: defaults("dark") } },
          { scope: ".brand" },
        ),
      );
      const used = new Set(css.match(/--[\w-]+(?=:)/g));

      expect(used.size).toBe(roleNames.length);
      for (const name of used) {
        expect(compiled, name).toContain(`${name}:`);
      }
      for (const role of roleNames) {
        expect(used).toContain(nameOf(tokens.color[role]));
      }
    });

    it("writes the font through the name tokens.css declares for the family", () => {
      const { css } = passed(
        createThemeStylesheet({ fontFamily: "Inter" }, { scope: ".brand" }),
      );
      const name = nameOf(tokens.type.family);

      expect(css.match(/--[\w-]+(?=:)/g)).toEqual([name]);
      expect(compiled).toContain(`${name}:`);
    });
  });

  it("does not parse the colours it writes as anything but what it was given", () => {
    const { css } = passed(createThemeStylesheet(brand, { scope: ".brand" }));
    const written = css.match(/#[0-9a-f]{6,8}(?=;)/g) ?? [];

    expect(written.length).toBeGreaterThan(0);
    for (const colour of written) {
      expect(parseColour(colour).a).toBeLessThanOrEqual(1);
    }
    expect(css).not.toMatch(/url\(|expression|@import|<|\\/);
  });
});

const roleNames = [
  "surface",
  "surfaceRaised",
  "text",
  "textMuted",
  "accent",
  "accentTint",
  "accentContrast",
  "hairline",
  "controlBoundary",
  "danger",
  "dangerTint",
  "scrim",
  "focusRing",
  "focusRingInner",
] as const;
