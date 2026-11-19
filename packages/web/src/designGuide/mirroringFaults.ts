// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { IconMirroring } from "./iconMirroring";

/** The components that draw an icon, and so take `mirrorInRtl`. */
const ICON_TAG = /<(?:Icon|IconButton|Button)\b/g;

/** The end of the opening tag that starts at `start`: the `>` outside every brace. */
function tagEnd(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    } else if (character === ">" && depth === 0 && source[index - 1] !== "=") {
      return index;
    }
  }
  return source.length;
}

/** `source` without its imports, comments and string literals, which name icons without using them. */
function codeOnly(source: string): string {
  return source
    .replace(/import[^;]*;/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"[^"\n]*"/g, '""');
}

/**
 * What is wrong with how `source` uses the icons in `table`: an icon decided
 * `mirrors` that is drawn without `mirrorInRtl`, one decided `fixed` that is
 * drawn with it (a wrapper that passes `mirrorInRtl={value}` on decides nothing), and a `mirrors` icon used where this check cannot see
 * whether it mirrors (outside the props of an icon component).
 */
export function mirroringFaults(
  source: string,
  table: Readonly<Record<string, IconMirroring>>,
): string[] {
  const code = codeOnly(source);
  const tags = [...code.matchAll(ICON_TAG)].map((match) => {
    const start = match.index ?? 0;
    return code.slice(start, tagEnd(code, start));
  });
  const faults: string[] = [];
  for (const [name, { decision }] of Object.entries(table)) {
    const use = new RegExp(`(?<![\\w.])${name}(?!\\w)`, "g");
    const total = [...code.matchAll(use)].length;
    const inTags = tags.filter((tag) => use.test(tag));
    use.lastIndex = 0;
    for (const tag of inTags) {
      const decided = /(?<![{\w])mirrorInRtl(?=\s|\/|$)/.test(tag);
      const passedOn = /\bmirrorInRtl=/.test(tag);
      if (decision === "mirrors" && !decided && !passedOn) {
        faults.push(
          `${name} is drawn without mirrorInRtl: ${tag.slice(0, 80)}`,
        );
      }
      if (decision === "fixed" && decided) {
        faults.push(`${name} is fixed but drawn with mirrorInRtl`);
      }
    }
    const seen = inTags.reduce(
      (sum, tag) => sum + [...tag.matchAll(use)].length,
      0,
    );
    if (decision === "mirrors" && total > seen) {
      faults.push(`${name} is used outside an icon component's props`);
    }
  }
  return faults;
}
