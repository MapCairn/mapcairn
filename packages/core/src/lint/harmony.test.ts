import { describe, expect, it } from "vitest";
// @ts-expect-error The scanner is dependency-free JavaScript with JSDoc types.
import { scanSource } from "../../../../scripts/harmony/rules.mjs";
// @ts-expect-error The scanner is dependency-free JavaScript with JSDoc types.
import { applyAllowList } from "../../../../scripts/harmony/scan.mjs";

/** One failing and one passing snippet for a rule. */
interface Case {
  readonly rule: string;
  readonly name: string;
  readonly file: string;
  readonly bad: string;
  readonly good: string;
}

const CSS = "packages/map/src/ui/Example/Example.css.ts";
const TSX = "packages/map/src/ui/Example/Example.tsx";
const TS = "packages/map/src/host/example.ts";

const css = (body: string): string =>
  `import { style } from "@vanilla-extract/css";\nimport { focusRing, tokens } from "@karta/theme";\nexport const a = style({\n${body}\n});\n`;

const cases: readonly Case[] = [
  {
    rule: "colour-literal",
    name: "hex colour",
    file: CSS,
    bad: css('  color: "#ff0000",'),
    good: css("  color: tokens.color.text,"),
  },
  {
    rule: "colour-literal",
    name: "rgb colour in a template",
    file: CSS,
    bad: css("  boxShadow: `0 0 0 1px rgb(0 0 0 / 0.2)`,"),
    good: css("  boxShadow: `0 0 0 1px ${tokens.color.hairline}`,"),
  },
  {
    rule: "colour-literal",
    name: "hsl colour",
    file: CSS,
    bad: css('  background: "hsl(210 20% 90%)",'),
    good: css('  background: "transparent",'),
  },
  {
    rule: "colour-literal",
    name: "oklch colour",
    file: CSS,
    bad: css('  color: "oklch(0.5 0.1 250)",'),
    good: css('  color: "currentColor",'),
  },
  {
    rule: "colour-literal",
    name: "colour in a style prop",
    file: TSX,
    bad: `export const x = <div style={{ "--x": "#fff" }} />;`,
    good: `export const x = <div style={{ "--x": 1 }} />;`,
  },
  {
    rule: "radius",
    name: "off-scale radius",
    file: CSS,
    bad: css('  borderRadius: "12px",'),
    good: css("  borderRadius: tokens.radius.control,"),
  },
  {
    rule: "radius",
    name: "numeric radius",
    file: CSS,
    bad: css("  borderRadius: 8,"),
    good: css('  borderRadius: "50%",'),
  },
  {
    rule: "radius",
    name: "zero radius",
    file: CSS,
    bad: css('  borderTopLeftRadius: "0.5rem",'),
    good: css("  borderRadius: 0,"),
  },
  {
    rule: "spacing",
    name: "px padding",
    file: CSS,
    bad: css('  padding: "10px",'),
    good: css("  padding: tokens.space.md,"),
  },
  {
    rule: "spacing",
    name: "numeric margin",
    file: CSS,
    bad: css("  marginTop: 8,"),
    good: css("  marginTop: 0,"),
  },
  {
    rule: "spacing",
    name: "rem gap",
    file: CSS,
    bad: css('  gap: "0.75rem",'),
    good: css("  gap: `calc(${tokens.space.sm} * 2)`,"),
  },
  {
    rule: "spacing",
    name: "px inset",
    file: CSS,
    bad: css('  inset: "12px 0 0 0",'),
    good: css('  inset: "0 auto auto 50%",'),
  },
  {
    rule: "spacing",
    name: "3px border",
    file: CSS,
    bad: css('  border: "3px solid red",'),
    good: css("  border: `2px solid ${tokens.color.hairline}`,"),
  },
  {
    rule: "font-size",
    name: "literal font size",
    file: CSS,
    bad: css('  fontSize: "16px",'),
    good: css("  fontSize: tokens.type.body.size,"),
  },
  {
    rule: "font-size",
    name: "font size below 13px",
    file: CSS,
    bad: css("  fontSize: 12,"),
    good: css("  fontSize: tokens.type.small.size,"),
  },
  {
    rule: "font-size",
    name: "small rem font size",
    file: CSS,
    bad: css('  fontSize: "0.75rem",'),
    good: css('  fontSize: "inherit",'),
  },
  {
    rule: "font-family",
    name: "font family",
    file: CSS,
    bad: css('  fontFamily: "Arial, sans-serif",'),
    good: css("  fontFamily: tokens.type.family,"),
  },
  {
    rule: "font-family",
    name: "font shorthand",
    file: CSS,
    bad: css('  font: "14px Arial",'),
    good: css('  font: "inherit",'),
  },
  {
    rule: "font-family",
    name: "font feature settings",
    file: CSS,
    bad: css('  fontFeatureSettings: "tnum",'),
    good: css('  fontVariantNumeric: "tabular-nums",'),
  },
  {
    rule: "font-weight",
    name: "bold",
    file: CSS,
    bad: css("  fontWeight: 700,"),
    good: css("  fontWeight: tokens.type.weight.semibold,"),
  },
  {
    rule: "font-weight",
    name: "literal 600",
    file: CSS,
    bad: css("  fontWeight: 600,"),
    good: css("  fontWeight: tokens.type.weight.regular,"),
  },
  {
    rule: "z-index",
    name: "raw z-index",
    file: CSS,
    bad: css("  zIndex: 10,"),
    good: css('  zIndex: zLayer("chrome"),'),
  },
  {
    rule: "z-index",
    name: "string z-index",
    file: CSS,
    bad: css('  zIndex: "999",'),
    good: css("  zIndex: tokens.z.sheet,"),
  },
  {
    rule: "position",
    name: "absolute outside a floating surface",
    file: CSS,
    bad: css('  position: "absolute",'),
    good: css('  position: "relative",'),
  },
  {
    rule: "position",
    name: "fixed outside a floating surface",
    file: CSS,
    bad: css('  position: "fixed",'),
    good: css('  position: "sticky",'),
  },
  {
    rule: "outline",
    name: "outline none",
    file: CSS,
    bad: css('  selectors: { "&:focus": { outline: "none" } },'),
    good: css(
      '  selectors: { "&:focus": { outline: "none" }, "&:focus-visible": focusRing },',
    ),
  },
  {
    rule: "outline",
    name: "outline 0",
    file: CSS,
    bad: css("  outline: 0,"),
    good: css("  outline: `2px solid ${tokens.color.accent}`,"),
  },
  {
    rule: "outline",
    name: "outline-style none",
    file: CSS,
    bad: css('  outlineStyle: "none",'),
    good: css("  ...focusRing,\n  outlineStyle: 'none',"),
  },
  {
    rule: "motion",
    name: "literal transition duration",
    file: CSS,
    bad: css('  transition: "opacity 200ms ease",'),
    good: css(
      "  transition: `opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,",
    ),
  },
  {
    rule: "motion",
    name: "literal animation duration",
    file: CSS,
    bad: css("  animation: `${spin} 1s linear infinite`,"),
    good: css("  animation: `${spin} ${tokens.motion.duration.slow} linear`,"),
  },
  {
    rule: "motion",
    name: "literal transition-duration",
    file: CSS,
    bad: css('  transitionDuration: "0.3s",'),
    good: css('  transition: "none",'),
  },
  {
    rule: "engine-selector",
    name: "Leaflet selector",
    file: CSS,
    bad: css('  selectors: { ".leaflet-container &": { margin: 0 } },'),
    good: css('  selectors: { "&:hover": { margin: 0 } },'),
  },
  {
    rule: "engine-selector",
    name: "MapLibre selector in a script",
    file: TS,
    bad: `export const sel = ".maplibregl-canvas";`,
    good: `export const sel = ".karta-canvas";`,
  },
  {
    rule: "inline-style",
    name: "style prop with a real property",
    file: TSX,
    bad: `export const x = <div style={{ top: 4 }} />;`,
    good: `export const x = <div style={{ "--fill": 4 }} />;`,
  },
  {
    rule: "inline-style",
    name: "style prop with a variable",
    file: TSX,
    bad: `export const x = <div style={styles} />;`,
    good: `export const x = <div className={cls} />;`,
  },
  {
    rule: "inline-style",
    name: "style prop on a component",
    file: TSX,
    bad: `export const x = <Track style={{ width: "10px" }} />;`,
    good: `export const x = <Track style={{ "--fill": fill } as CSSProperties} />;`,
  },
  {
    rule: "tab-index",
    name: "tabIndex above 0 in JSX",
    file: TSX,
    bad: `export const x = <div tabIndex={2} />;`,
    good: `export const x = <div tabIndex={-1} />;`,
  },
  {
    rule: "tab-index",
    name: "tabindex attribute in html",
    file: "packages/web/public/page.html",
    bad: `<div tabindex="3"></div>`,
    good: `<div tabindex="0"></div>`,
  },
  {
    rule: "tab-index",
    name: "tabIndex assigned in a script",
    file: TS,
    bad: `export const f = (el: HTMLElement) => { el.tabIndex = 5; };`,
    good: `export const f = (el: HTMLElement) => { el.tabIndex = -1; };`,
  },
  {
    rule: "viewport",
    name: "user-scalable=no",
    file: "packages/web/src/root.tsx",
    bad: `export const m = <meta name="viewport" content="width=device-width, user-scalable=no" />;`,
    good: `export const m = <meta name="viewport" content="width=device-width, initial-scale=1" />;`,
  },
  {
    rule: "viewport",
    name: "maximum-scale in html",
    file: "packages/web/index.html",
    bad: `<meta name="viewport" content="width=device-width, maximum-scale=1">`,
    good: `<meta name="viewport" content="width=device-width">`,
  },
  {
    rule: "live-region",
    name: "aria-live",
    file: TSX,
    bad: `export const x = <div aria-live="polite" />;`,
    good: `export const x = <div aria-live="off" />;`,
  },
  {
    rule: "live-region",
    name: 'role="status"',
    file: TSX,
    bad: `export const x = <p role="status">Saved</p>;`,
    good: `export const x = <p>Saved</p>;`,
  },
  {
    rule: "live-region",
    name: 'role="alert" in a script',
    file: TS,
    bad: `export const a = { role: "alert" };`,
    good: `export const a = { role: "group" };`,
  },
  {
    rule: "icon-sizing",
    name: "size on a lucide icon",
    file: TSX,
    bad: `import { Search } from "lucide-react";\nexport const x = <Search size={20} />;`,
    good: `import { Search } from "lucide-react";\nexport const x = <Icon icon={Search} />;`,
  },
  {
    rule: "icon-sizing",
    name: "strokeWidth on an aliased lucide icon",
    file: TSX,
    bad: `import { Search as Magnifier } from "lucide-react";\nexport const x = <Magnifier strokeWidth={1} />;`,
    good: `import { Search as Magnifier } from "lucide-react";\nexport const x = <Magnifier className={cls} />;`,
  },
  {
    rule: "icon-sizing",
    name: "size on the Icon component",
    file: TSX,
    bad: `export const x = <Icon icon={Search} size={32} />;`,
    good: `export const x = <IconButton icon={Search} label="Search" size="compact" />;`,
  },
  {
    rule: "icon-only-button",
    name: "button with only an icon",
    file: TSX,
    bad: `import { X } from "lucide-react";\nexport const b = <button type="button"><X /></button>;`,
    good: `import { X } from "lucide-react";\nexport const b = <button type="button" aria-label="Close"><X /></button>;`,
  },
  {
    rule: "icon-only-button",
    name: "button with only an Icon",
    file: TSX,
    bad: `export const b = (\n  <button type="button">\n    <Icon icon={X} />\n  </button>\n);`,
    good: `export const b = (\n  <button type="button">\n    <Icon icon={X} />\n    Close\n  </button>\n);`,
  },
  {
    rule: "icon-only-button",
    name: "button with a bare svg",
    file: TSX,
    bad: `export const b = <button type="button"><svg viewBox="0 0 1 1"><path d="M0 0" /></svg></button>;`,
    good: `export const b = <button type="button" title="Close"><svg viewBox="0 0 1 1"><path d="M0 0" /></svg></button>;`,
  },
  {
    rule: "engine-control",
    name: "L.control",
    file: TS,
    bad: `export const c = (L: any) => L.control.zoom();`,
    good: `export const c = (L: any) => L.map("x", { zoomControl: false });`,
  },
  {
    rule: "engine-control",
    name: "addControl",
    file: TS,
    bad: `export const c = (map: any, ctl: unknown) => map.addControl(ctl);`,
    good: `export const c = (map: any) => map.remove();`,
  },
  {
    rule: "engine-control",
    name: "MapLibre NavigationControl",
    file: TS,
    bad: `export const c = (g: any) => new g.NavigationControl();`,
    good: `export const c = (g: any) => new g.Map();`,
  },
  {
    rule: "service-singleton",
    name: "createServices at module scope",
    file: "packages/web/src/routes/home.tsx",
    bad: `import { createServices } from "../composition/createServices";\nexport const services = createServices();`,
    good: `import { createServices } from "../composition/createServices";\nexport const make = () => createServices();\nexport function build() {\n  return createServices();\n}`,
  },
  {
    rule: "service-singleton",
    name: "createServices in an arrow at module scope",
    file: "packages/web/src/routes/home.tsx",
    bad: `const services = createServices({ overrides: {} });`,
    good: `const make = () =>\n  createServices({ overrides: {} });`,
  },
  {
    rule: "service-singleton",
    name: "adapter constructed outside the composition root",
    file: "packages/map/src/host/useThing.ts",
    bad: `export const store = new LocalStorageSettingsStore();`,
    good: `export const store = useSettings();`,
  },
  {
    rule: "service-singleton",
    name: "browser adapter constructed in a component",
    file: TSX,
    bad: `const clip = new BrowserClipboard();`,
    good: `const clip = useClipboard();`,
  },
];

describe("harmony rules", () => {
  for (const { rule, name, file, bad, good } of cases) {
    it(`${rule}: flags ${name}`, () => {
      const found = scanSource(file, bad).map((v: { rule: string }) => v.rule);
      expect(found).toContain(rule);
    });
    it(`${rule}: passes the fix for ${name}`, () => {
      const found = scanSource(file, good).map((v: { rule: string }) => v.rule);
      expect(found).not.toContain(rule);
    });
  }

  it("covers every rule id the scanner can report", () => {
    const ids = new Set(cases.map((c) => c.rule));
    expect([...ids].sort()).toEqual(
      [
        "colour-literal",
        "engine-control",
        "engine-selector",
        "font-family",
        "font-size",
        "font-weight",
        "icon-only-button",
        "icon-sizing",
        "inline-style",
        "live-region",
        "motion",
        "outline",
        "position",
        "radius",
        "service-singleton",
        "spacing",
        "tab-index",
        "viewport",
        "z-index",
      ].sort(),
    );
  });

  it("reports the file, the line and the rule id", () => {
    const found = scanSource(CSS, css('  zIndex: 10,\n  color: "#fff",'));
    expect(found).toEqual([
      expect.objectContaining({ file: CSS, line: 4, rule: "z-index" }),
      expect.objectContaining({ file: CSS, line: 5, rule: "colour-literal" }),
    ]);
  });
});

describe("harmony rule scoping", () => {
  const absolute = css('  position: "absolute",');

  it.each([
    "packages/map/src/chrome/MapChrome/MapChrome.css.ts",
    "packages/map/src/chrome/EndStack/EndStack.css.ts",
    "packages/map/src/chrome/Sheet/Sheet.css.ts",
    "packages/map/src/chrome/Attribution/Attribution.css.ts",
    "packages/map/src/ui/Tooltip/Tooltip.css.ts",
    "packages/map/src/ui/VisuallyHidden/VisuallyHidden.css.ts",
    "packages/map/src/ui/SkipLink/SkipLink.css.ts",
    "packages/map/src/host/MapView.css.ts",
    "packages/map/src/host/overlays/overlays.css.ts",
  ])("allows absolute positioning in %s", (file) => {
    expect(scanSource(file, absolute)).toEqual([]);
  });

  it("flags absolute positioning in an ordinary component", () => {
    expect(
      scanSource("packages/map/src/ui/Button/Button.css.ts", absolute),
    ).toHaveLength(1);
  });

  it("allows live regions in LiveRegion and StatusMessage only", () => {
    const live = `export const x = <div aria-live="polite" role="status" />;`;
    expect(
      scanSource("packages/map/src/ui/LiveRegion/LiveRegion.tsx", live),
    ).toEqual([]);
    expect(
      scanSource("packages/map/src/ui/StatusMessage/StatusMessage.tsx", live),
    ).toEqual([]);
    expect(scanSource("packages/map/src/ui/Chip/Chip.tsx", live)).not.toEqual(
      [],
    );
  });

  it("allows icon sizing inside the Icon component only", () => {
    const sized = `import { Search } from "lucide-react";\nexport const x = <Search size={24} strokeWidth={2} />;`;
    expect(scanSource("packages/map/src/ui/Icon/Icon.tsx", sized)).toEqual([]);
    expect(scanSource("packages/map/src/ui/Chip/Chip.tsx", sized)).not.toEqual(
      [],
    );
  });

  it("allows adapters and the composition root to build services", () => {
    const build = `export const clip = new BrowserClipboard();`;
    expect(
      scanSource("packages/web/src/composition/createServices.ts", build),
    ).toEqual([]);
    expect(
      scanSource("packages/web/src/adapters/clipboard/x.ts", build),
    ).toEqual([]);
  });

  it("does not flag a createServices declaration or a call inside a function", () => {
    const code = `export function createServices() {\n  return {};\n}\nexport function useIt() {\n  return createServices();\n}`;
    expect(
      scanSource("packages/web/src/routes/home.tsx", code).filter(
        (v: { rule: string }) => v.rule === "service-singleton",
      ),
    ).toEqual([]);
  });

  it("allows 1px and 2px line widths and percentage insets", () => {
    expect(
      scanSource(CSS, css('  border: "1px solid",\n  top: "50%",')),
    ).toEqual([]);
  });

  it("ignores values inside comments", () => {
    expect(
      scanSource(CSS, css('  // color: "#fff", zIndex: 10\n  margin: 0,')),
    ).toEqual([]);
  });

  it("reads custom properties as allowed inline styles but checks their colours", () => {
    const rules = scanSource(
      TSX,
      `export const x = <div style={{ "--tint": "rgb(0 0 0)" }} />;`,
    ).map((v: { rule: string }) => v.rule);
    expect(rules).toEqual(["colour-literal"]);
  });

  it("counts an icon with a label as a named button", () => {
    const code = `export const b = <button type="button"><Icon icon={X} label="Close" /></button>;`;
    expect(scanSource(TSX, code)).toEqual([]);
  });
});

describe("allow-list", () => {
  const violation = {
    file: "packages/map/src/ui/A/A.css.ts",
    line: 2,
    rule: "z-index",
    message: "x",
  };
  const lines = ["", "  zIndex: 10,"];

  it("excuses a violation that matches rule, file and snippet", () => {
    const entry = {
      rule: "z-index",
      file: violation.file,
      contains: "zIndex: 10",
      reason: "test",
    };
    const result = applyAllowList([violation], () => lines, [entry]);
    expect(result.violations).toEqual([]);
    expect(result.unused).toEqual([]);
  });

  it("keeps a violation when the snippet differs", () => {
    const entry = {
      rule: "z-index",
      file: violation.file,
      contains: "zIndex: 99",
      reason: "test",
    };
    const result = applyAllowList([violation], () => lines, [entry]);
    expect(result.violations).toEqual([violation]);
  });

  it("reports an entry that matches nothing as unused", () => {
    const entry = {
      rule: "radius",
      file: violation.file,
      contains: "x",
      reason: "test",
    };
    const result = applyAllowList([violation], () => lines, [entry]);
    expect(result.unused).toEqual([entry]);
  });
});
