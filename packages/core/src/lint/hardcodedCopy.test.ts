// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
// @ts-expect-error The allow-list is dependency-free JavaScript with JSDoc types.
import { COPY_ALLOWLIST } from "../../../../scripts/copy-check/allowlist.mjs";
import {
  findHardcodedCopy,
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
  ])("passes %s", (_name, jsx) => {
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

describe("the interface source", () => {
  const found = files().map((file) => ({ file, findings: scan(read(file)) }));

  it("scans the React source of the map and the host", () => {
    const names = files();
    expect(names.some((n) => n.startsWith("packages/map/src/"))).toBe(true);
    expect(names.some((n) => n.startsWith("packages/web/src/"))).toBe(true);
    expect(names.filter((n) => /\.(test|stories)\.tsx$/.test(n))).toEqual([]);
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
