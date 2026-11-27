// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
// @ts-expect-error The allow-list is dependency-free JavaScript with JSDoc types.
import { COPY_ALLOWLIST } from "../../../../scripts/copy-check/allowlist.mjs";
import {
  findCopyIn,
  findHardcodedCopy,
  findLitCopy,
  listCopyFiles,
  readRepoFile,
  // @ts-expect-error The scanner is dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/copy-check/scan.mjs";

interface Finding {
  readonly line: number;
  readonly kind: "text" | "attribute";
  readonly text: string;
  readonly attribute?: string;
}

interface AllowEntry {
  readonly file: string;
  readonly text?: string;
  readonly reason: string;
}

const scan = findHardcodedCopy as (source: string) => Finding[];
const scanLit = findLitCopy as (source: string) => Finding[];
const scanFile = findCopyIn as (file: string, source: string) => Finding[];
const files = listCopyFiles as () => string[];
const read = readRepoFile as (file: string) => string;
const allowList = COPY_ALLOWLIST as readonly AllowEntry[];

/** The texts found in `jsx`, wrapped in a component. */
function textsIn(jsx: string): string[] {
  return scan(`export const A = () => (\n${jsx}\n);\n`).map((f) => f.text);
}

describe("the hardcoded copy scanner", () => {
  it.each([
    ["JSX text", "<p>Close the sheet</p>", ["Close the sheet"]],
    [
      "text beside an element",
      "<p>Back to <b>x</b> now</p>",
      ["Back to", "x", "now"],
    ],
    ["text in a fragment", "<>Hello there</>", ["Hello there"]],
    ["text after a container", "<p>{n} items</p>", ["items"]],
    ["a literal in a container", '<p>{"Reset"}</p>', ["Reset"]],
    [
      "literal branches",
      '<p>{open ? "Open" : "Closed"}</p>',
      ["Open", "Closed"],
    ],
    ["aria-label", '<button aria-label="Close" />', ["Close"]],
    ["aria-description", '<i aria-description="Drag me" />', ["Drag me"]],
    ["aria-roledescription", '<i aria-roledescription="map" />', ["map"]],
    ["title", '<i title="Zoom in" />', ["Zoom in"]],
    ["placeholder", '<input placeholder="Search" />', ["Search"]],
    ["alt", '<img alt="A map" />', ["A map"]],
    ["a literal in an expression", '<i title={"Zoom"} />', ["Zoom"]],
    ["a conditional attribute", '<i title={on ? "On" : t("k")} />', ["On"]],
    ["a template with words", "<i title={`Zoom ${n}`} />", ["Zoom"]],
    ["aria-valuetext", '<i aria-valuetext="Half full" />', ["Half full"]],
    ["aria-placeholder", '<i aria-placeholder="Type here" />', ["Type here"]],
    [
      "a literal after an element with an apostrophe",
      '<p>{ok ? <i>Don\'t</i> : "Fallback"}</p>',
      ["Fallback", "Don't"],
    ],
    [
      "text nested in a container",
      "<ul>{xs.map((x) => <li>Item</li>)}</ul>",
      ["Item"],
    ],
  ])("flags %s", (_name, jsx, expected) => {
    expect(textsIn(jsx)).toEqual(expected);
  });

  it.each([
    ["a catalogue lookup", '<p>{t("app.reload", {})}</p>'],
    ["a lookup in an attribute", '<i aria-label={t("k", {})} />'],
    ["a lookup with literal arguments", '<i title={t("k", { a: "b" })} />'],
    ["a number", "<p>{count}</p>"],
    ["a number written out", "<p>12</p>"],
    ["punctuation and entities", "<p>&middot; / &times; </p>"],
    ["an empty alt", '<img alt="" />'],
    ["an icon name", '<Icon icon={Plus} name="plus" />'],
    ["a class name", '<p className="label">{x}</p>'],
    ["a token name", '<p style={{ color: "var(--ink)" }}>{x}</p>'],
    ["a test id", '<p data-testid="search-box">{x}</p>'],
    ["a URL", '<a href="https://example.org/a">{x}</a>'],
    [
      "a comparison in a condition",
      '<p>{mode === "draw" ? t("a", {}) : null}</p>',
    ],
    ["a prop that is not copy", '<Button label="Close" />'],
    ["a tooltip prop", '<Hint tooltip="Zoom in" />'],
  ])("passes %s", (_name, jsx) => {
    expect(textsIn(jsx)).toEqual([]);
  });

  it.each([
    ["string concatenation", '<i title={"Zoom " + "in"} />'],
    ["an array of literals", '<i title={["Zoom", "in"].join(" ")} />'],
    ["a spread object", '<i {...{ title: "Zoom in" }} />'],
    ["a literal held in a variable", "<i title={label} />"],
  ])("does not detect %s (a known limit)", (_name, jsx) => {
    expect(textsIn(jsx)).toEqual([]);
  });

  it("reports the line of each finding", () => {
    const found = scan(
      'export const A = () => (\n  <div>\n    <i title="Zoom" />\n    Hello\n  </div>\n);\n',
    );
    expect(found.map((f) => [f.line, f.kind, f.attribute])).toEqual([
      [3, "attribute", "title"],
      [4, "text", undefined],
    ]);
  });
});

/** The texts found in the Lit template `body`. */
function litTextsIn(body: string): string[] {
  return scanLit(
    `import { html, nothing } from "lit";\nexport const a = () => html\`${body}\`;\n`,
  ).map((f) => f.text);
}

describe("the hardcoded copy scanner on Lit templates", () => {
  it.each([
    ["text", "<p>Close the sheet</p>", ["Close the sheet"]],
    ["text beside a binding", "<p>${n} items</p>", ["items"]],
    ["text with no element", "Hello there", ["Hello there"]],
    ["a literal in a binding", '<p>${"Reset"}</p>', ["Reset"]],
    [
      "literal branches",
      '<p>${open ? "Open" : "Closed"}</p>',
      ["Open", "Closed"],
    ],
    [
      "text in a nested template",
      "<ul>${xs.map(() => html`<li>Item</li>`)}</ul>",
      ["Item"],
    ],
    [
      "text two templates down, read once",
      "${open ? html`<ul>${xs.map((x) => html`<li>${x} left</li>`)}</ul>` : nothing}",
      ["left"],
    ],
    ["a copy attribute", '<button aria-label="Close"></button>', ["Close"]],
    ["an unquoted copy attribute", "<input placeholder=Search />", ["Search"]],
    ["a bound literal", '<i title=${"Zoom in"}></i>', ["Zoom in"]],
    ["a bound conditional", '<i title=${on ? "On" : t("k")}></i>', ["On"]],
    [
      "words beside a binding in an attribute",
      '<i title="Zoom ${n}"></i>',
      ["Zoom"],
    ],
    ["a copy property", '<input .placeholder=${"Search"} />', ["Search"]],
    ["an ARIA property", '<i .ariaLabel=${"Close"}></i>', ["Close"]],
  ])("flags %s", (_name, body, expected) => {
    expect(litTextsIn(body)).toEqual(expected);
  });

  it.each([
    ["a catalogue lookup", '<p>${t("app.reload", {})}</p>'],
    ["a lookup in an attribute", '<i aria-label=${t("k", {})}></i>'],
    ["numbers, punctuation and entities", "<p>12 &middot; / &times;</p>"],
    [
      "attributes that are not copy",
      '<i class="label" data-testid="box" role="img"></i>',
    ],
    ["an event listener", '<i @title=${() => "changed"}></i>'],
    ["a boolean binding", '<i ?title=${"yes"}></i>'],
    ["a property that is not copy", '<i .value=${"draw"}></i>'],
    [
      "a comparison in a condition",
      '<p>${mode === "draw" ? t("a") : nothing}</p>',
    ],
    ["a comment", "<!-- Close the sheet -->"],
    [
      "the paths of an icon",
      '<svg viewBox="0 0 8 8"><path d="M0 0L8 8"></path></svg>',
    ],
  ])("passes %s", (_name, body) => {
    expect(litTextsIn(body)).toEqual([]);
  });

  it.each([
    ["string concatenation", '<i title=${"Zoom " + "in"}></i>'],
    ["a literal held in a variable", "<p>${label}</p>"],
    [
      "a prop of another element that carries copy",
      '<x-hint label="Zoom in"></x-hint>',
    ],
  ])("does not detect %s (a known limit)", (_name, body) => {
    expect(litTextsIn(body)).toEqual([]);
  });

  it("reports the line of each finding", () => {
    const found = scanLit(
      'import { html } from "lit";\nexport const a = () => html`\n  <i\n    title="Zoom"\n  >\n    Hello\n  </i>`;\n',
    );
    expect(found.map((f) => [f.line, f.kind, f.attribute])).toEqual([
      [4, "attribute", "title"],
      [6, "text", undefined],
    ]);
  });

  it.each([
    [
      "a ternary after a line comment with an apostrophe",
      '<p>${// it\'s one of two\n on ? "Open" : "Closed"}</p>',
      ["Open", "Closed"],
    ],
    ["a literal after a block comment", '<p>${/* c */ "Close"}</p>', ["Close"]],
    [
      "text after a hole with a quote in a regular expression",
      '<p>${s.replace(/\'/g, "")}</p><p>Close</p>',
      ["Close"],
    ],
    [
      "the attributes and text of a tag whose name is a hole",
      '<${tag} aria-label="Close">Open</${tag}>',
      ["Close", "Open"],
    ],
    ["textContent", '<i .textContent=${"Close"}></i>', ["Close"]],
    ["innerText", '<i .innerText="Close"></i>', ["Close"]],
    ["innerHTML", '<i .innerHTML=${"<b>Close</b>"}></i>', ["<b>Close</b>"]],
    [
      "a parenthesised conditional",
      '<p>${(on ? "Open" : "Closed")}</p>',
      ["Open", "Closed"],
    ],
  ])("flags %s", (_name, body, expected) => {
    expect(litTextsIn(body)).toEqual(expected);
  });

  it("reports a template that never closes", () => {
    expect(
      scanLit("export const a = html`<p>${t()}</p>").map((f) => f.kind),
    ).toEqual(["unreadable"]);
  });

  it("does not let the JSX reader run into a Lit template in a .tsx file", () => {
    expect(
      scanFile(
        "packages/map/src/a.tsx",
        'export const a = html`<p><br>${t("a")}`;\nexport const b = count > 1;\nexport const c = {};\n',
      ),
    ).toEqual([]);
  });

  it("reads a .ts file's templates and not its string tables or type arguments", () => {
    const source =
      'import { html } from "lit";\nexport const table = { a: "Close" };\nexport const list = new Array<string>();\nexport const b = html`<p>Open</p>`;\n';
    expect(
      scanFile("packages/map/src/a.ts", source).map((f) => f.text),
    ).toEqual(["Open"]);
  });

  it("reads both JSX and templates in a .tsx file", () => {
    const source =
      'import { html } from "lit";\nexport const A = () => <p>Close</p>;\nexport const b = html`Open`;\n';
    expect(
      scanFile("packages/map/src/a.tsx", source).map((f) => f.text),
    ).toEqual(["Close", "Open"]);
  });
});

describe("the interface source", () => {
  const found = files().map((file) => ({
    file,
    findings: scanFile(file, read(file)),
  }));

  it("scans the React source of the map and the host", () => {
    const names = files();
    expect(names.some((n) => n.startsWith("packages/map/src/"))).toBe(true);
    expect(names.some((n) => n.startsWith("packages/web/src/"))).toBe(true);
    expect(names.filter((n) => /\.(test|stories)\.tsx?$/.test(n))).toEqual([]);
  });

  it("scans the TypeScript files, which may hold Lit templates, but no declaration file", () => {
    const names = files();
    expect(names).toContain("packages/map/src/index.ts");
    expect(names.filter((n) => n.endsWith(".d.ts"))).toEqual([]);
  });

  it("holds no literal interface text outside the allow-list", () => {
    const unlisted = found.flatMap(({ file, findings }) =>
      findings
        .filter(
          (f) =>
            !allowList.some(
              (e) =>
                e.file === file && (e.text === undefined || e.text === f.text),
            ),
        )
        .map(
          (f) =>
            `${file}:${f.line} ${f.attribute ?? "text"} ${JSON.stringify(f.text)}`,
        ),
    );
    expect(unlisted).toEqual([]);
  });

  it("scans the privacy page, which has no allow-list entry because its text is in the catalogue", () => {
    expect(files()).toContain("packages/web/src/app/PrivacyPage.tsx");
    expect(allowList.map((entry) => entry.file)).not.toContain(
      "packages/web/src/app/PrivacyPage.tsx",
    );
  });

  it("gives every allow-list entry a reason and a text it still excuses", () => {
    for (const entry of allowList) {
      expect(entry.reason.trim().length, entry.file).toBeGreaterThan(0);
      const hits = found.find((f) => f.file === entry.file)?.findings ?? [];
      const matches = hits.filter(
        (f) => entry.text === undefined || f.text === entry.text,
      );
      expect(
        matches.length,
        `${entry.file} ${entry.text ?? ""}`,
      ).toBeGreaterThan(0);
    }
  });
});
