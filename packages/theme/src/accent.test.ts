// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { type AccentResolution, resolveAccent } from "./accent";
import { checkThemeContrast, type ThemeColours } from "./checkThemeContrast";
import { parseColour, toHex, toOklch } from "./contrast";
import type { ThemeName } from "./tokenValues";

const noExplicit = { light: {}, dark: {} };

/** The resolution, which the test requires to be accepted. */
function accepted(
  accent: unknown,
  explicit: Record<ThemeName, Partial<ThemeColours>> = noExplicit,
): Extract<AccentResolution, { ok: true }> {
  const resolution = resolveAccent(accent, explicit);
  if (!resolution.ok) {
    throw new Error(`Refused: ${JSON.stringify(resolution)}`);
  }
  return resolution;
}

function lightnessOf(colour: string): number {
  return toOklch(parseColour(colour)).lightness;
}

/** The colour of one role the resolver used in one theme. */
function roleValue(
  resolution: Extract<AccentResolution, { ok: true }>,
  theme: ThemeName,
  role: string,
): string | undefined {
  return resolution.derived.find(
    (entry) => entry.theme === theme && entry.role === role,
  )?.value;
}

/** The six colours of the decision record, with the lightness each theme settles on. */
const records: ReadonlyArray<{
  name: string;
  colour: string;
  light: number | "given";
  dark: number | "given";
}> = [
  { name: "navy", colour: "#0b2545", light: "given", dark: 0.72 },
  { name: "green", colour: "#0b5c3a", light: "given", dark: 0.72 },
  { name: "mid green", colour: "#2e8b57", light: 0.5, dark: 0.71 },
  { name: "red", colour: "#d62828", light: 0.54, dark: 0.74 },
  { name: "yellow", colour: "#ffd60a", light: 0.52, dark: "given" },
  { name: "pure green", colour: "#00ff00", light: 0.51, dark: "given" },
];

describe.each(records)("$name $colour", (record) => {
  const resolution = accepted(record.colour);

  it.each(["light", "dark"] as const)(
    "passes every pair in the %s theme",
    (theme) => {
      const check = checkThemeContrast({
        colour: { [theme]: Object.fromEntries(colourOf(resolution, theme)) },
      });
      expect(check.invalid).toEqual([]);
      expect(check.findings.filter((finding) => !finding.passes)).toEqual([]);
    },
  );

  it.each(["light", "dark"] as const)(
    "settles the %s accent as the record lists, or nearer",
    (theme) => {
      const used = roleValue(resolution, theme, "accent") as string;
      const expected = record[theme];
      const entry = resolution.derived.find(
        (item) => item.theme === theme && item.role === "accent",
      );
      if (expected === "given") {
        expect(used).toBe(toHex(parseColour(record.colour)));
        expect(entry?.source).toBe("given");
        return;
      }
      const start = lightnessOf(record.colour);
      expect(entry?.source).toBe("moved");
      expect(Math.abs(lightnessOf(used) - start)).toBeLessThanOrEqual(
        Math.abs(expected - start) + 0.01,
      );
    },
  );

  it("keeps the hue of the accent when it moves lightness", () => {
    const start = toOklch(parseColour(record.colour));
    for (const theme of ["light", "dark"] as const) {
      const used = toOklch(
        parseColour(roleValue(resolution, theme, "accent") as string),
      );
      expect(Math.abs(used.hue - start.hue)).toBeLessThan(8);
    }
  });
});

/** The role colours of one theme in a resolution, as entries. */
function colourOf(
  resolution: Extract<AccentResolution, { ok: true }>,
  theme: ThemeName,
): Array<[string, string]> {
  return Object.entries(resolution.colour[theme]) as Array<[string, string]>;
}

describe("resolveAccent derived list", () => {
  it("reports the four roles for each theme, with how each was reached", () => {
    const { derived } = accepted("#2e8b57");
    expect(derived.map(({ theme, role }) => `${theme} ${role}`).sort()).toEqual(
      ["light", "dark"]
        .flatMap((theme) =>
          ["accent", "accentContrast", "accentTint", "focusRing"].map(
            (role) => `${theme} ${role}`,
          ),
        )
        .sort(),
    );
    expect(derived.find((entry) => entry.role === "accentTint")?.source).toBe(
      "derived",
    );
  });

  it("writes the same colours as the list reports", () => {
    const resolution = accepted("#2e8b57");
    for (const entry of resolution.derived) {
      expect(
        (resolution.colour[entry.theme] as Record<string, string>)[entry.role],
      ).toBe(entry.value);
    }
  });

  it("picks white or near black on the accent, whichever reads better", () => {
    expect(roleValue(accepted("#0b2545"), "light", "accentContrast")).toBe(
      "#ffffff",
    );
    expect(
      lightnessOf(
        roleValue(accepted("#ffd60a"), "dark", "accentContrast") as string,
      ),
    ).toBeLessThan(0.5);
  });

  it("is deterministic and leaves its input alone", () => {
    const explicit = { light: { text: "#111111" }, dark: {} };
    const frozen = structuredClone(explicit);
    expect(resolveAccent("#d62828", explicit)).toEqual(
      resolveAccent("#d62828", explicit),
    );
    expect(explicit).toEqual(frozen);
  });

  it("reads an accent written as rgb() or oklch()", () => {
    expect(accepted("rgb(11 92 58)").derived[0]?.value).toBeDefined();
    expect(
      roleValue(accepted("oklch(0.4 0.08 160)"), "light", "accent"),
    ).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("resolveAccent gamut clamping", () => {
  it("cuts chroma to the sRGB gamut when lightness moves far", () => {
    const moved = roleValue(accepted("#00ff00"), "light", "accent") as string;
    const original = toOklch(parseColour("#00ff00"));
    const result = toOklch(parseColour(moved));
    expect(result.chroma).toBeLessThan(original.chroma);
    expect(result.chroma).toBeGreaterThan(0.1);
    expect(moved).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("settles a very light accent far down in the light theme", () => {
    const moved = roleValue(accepted("#fffbe6"), "light", "accent") as string;
    expect(lightnessOf(moved)).toBeLessThan(0.6);
  });

  it("settles a very dark accent far up in the dark theme", () => {
    const moved = roleValue(accepted("#050510"), "dark", "accent") as string;
    expect(lightnessOf(moved)).toBeGreaterThan(0.6);
  });

  it("settles a grey accent without adding colour", () => {
    const moved = roleValue(accepted("#808080"), "light", "accent") as string;
    expect(toOklch(parseColour(moved)).chroma).toBeLessThan(0.01);
  });
});

describe("resolveAccent explicit roles", () => {
  it("never moves an explicit accent that passes", () => {
    const resolution = accepted("#d62828", {
      light: { accent: "#0b5c3a" },
      dark: {},
    });
    expect(roleValue(resolution, "light", "accent")).toBeUndefined();
    expect(resolution.colour.light).not.toHaveProperty("accent");
    expect(roleValue(resolution, "light", "accentContrast")).toBe("#ffffff");
    expect(roleValue(resolution, "dark", "accent")).not.toBe("#d62828");
  });

  it("does not report or write a role the host set", () => {
    const resolution = accepted("#0b5c3a", {
      light: { accentTint: "#d9efe4" },
      dark: {},
    });
    expect(roleValue(resolution, "light", "accentTint")).toBeUndefined();
    expect(resolution.colour.light).not.toHaveProperty("accentTint");
  });

  it("refuses an explicit accent that fails and names the nearest passing colour", () => {
    const resolution = resolveAccent("#0b5c3a", {
      light: { accent: "#7fd9aa" },
      dark: {},
    });
    expect(resolution.ok).toBe(false);
    if (resolution.ok) {
      return;
    }
    const [failure] = resolution.failures;
    expect(failure).toMatchObject({ theme: "light", role: "accent" });
    expect(failure?.nearest).toMatch(/^#[0-9a-f]{6}$/);
    expect(failure?.message).toContain(failure?.nearest);
    expect(
      resolveAccent("#0b5c3a", {
        light: { accent: failure?.nearest as string },
        dark: {},
      }).ok,
    ).toBe(true);
  });

  it("refuses an explicit accentContrast that fails and names the nearest", () => {
    const resolution = resolveAccent("#0b5c3a", {
      light: { accent: "#0b5c3a", accentContrast: "#888888" },
      dark: {},
    });
    expect(resolution.ok).toBe(false);
    if (resolution.ok) {
      return;
    }
    expect(resolution.failures).toHaveLength(1);
    const [failure] = resolution.failures;
    expect(failure).toMatchObject({
      theme: "light",
      role: "accentContrast",
      value: "#888888",
      message:
        "The accentContrast #888888 in the light theme is below WCAG 2.2 AA. The nearest colour that passes is #c2c2c2.",
    });
    expect(
      resolveAccent("#0b5c3a", {
        light: {
          accent: "#0b5c3a",
          accentContrast: failure?.nearest as string,
        },
        dark: {},
      }).ok,
    ).toBe(true);
  });

  it("refuses with a clear message when no lightness passes", () => {
    const resolution = resolveAccent("#0b5c3a", {
      light: { surface: "#595959", surfaceRaised: "#595959" },
      dark: {},
    });
    expect(resolution.ok).toBe(false);
    if (resolution.ok) {
      return;
    }
    expect(resolution.failures).toEqual([
      expect.objectContaining({
        theme: "light",
        role: "accent",
        nearest: undefined,
        message: expect.stringMatching(/no lightness/i),
      }),
    ]);
  });
});

describe("resolveAccent invalid input", () => {
  it.each([
    ["not a colour", "unparseable"],
    ["", "unparseable"],
    [42, "unparseable"],
    [undefined, "unparseable"],
    ["oklch(0.7 0.4 150)", "out-of-gamut"],
    ["#0b5c3a80", "translucent"],
  ])("refuses %j as %s", (accent, reason) => {
    const resolution = resolveAccent(accent, noExplicit);
    expect(resolution).toMatchObject({
      ok: false,
      invalid: [{ theme: null, role: "accent", value: accent, reason }],
      failures: [],
    });
  });
});
