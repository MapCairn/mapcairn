// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  declarationBlock,
  withDeclarationBlock,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/declarationBlocks.mjs";

const EMITTED = [
  "// SPDX-License-Identifier: AGPL-3.0-only",
  "// Copyright MapCairn contributors",
  "/** The file's own comment. */",
  'import type { Element } from "./types";',
  'import type { Props } from "react";',
  "declare global {",
  "    interface HTMLElementTagNameMap {",
  '        "x-y": Element;',
  "    }",
  "}",
  "export {};",
  "",
].join("\n");

describe("declarationBlock", () => {
  it("drops the header, the empty export and the imports of files the entry already holds", () => {
    expect(
      declarationBlock(EMITTED, { inEntry: true, entryFile: "./browser.js" }),
    ).toBe(
      [
        'import type { Props } from "react";',
        "declare global {",
        "    interface HTMLElementTagNameMap {",
        '        "x-y": Element;',
        "    }",
        "}",
      ].join("\n"),
    );
  });

  it("points an import of the package's own files at the entry's declarations, and keeps other imports", () => {
    const block = declarationBlock(EMITTED, {
      inEntry: false,
      entryFile: "./browser.js",
    });
    expect(block).toContain('import type { Element } from "./browser.js";');
    expect(block).toContain('import type { Props } from "react";');
  });

  it("reads an import that runs over several lines", () => {
    const block = declarationBlock(
      'import type {\n  A,\n  B,\n} from "../index";\ndeclare module "m" {}\n',
      { inEntry: false, entryFile: "./browser.js" },
    );
    expect(block).toBe(
      'import type {\n  A,\n  B,\n} from "./browser.js";\ndeclare module "m" {}',
    );
  });
});

describe("withDeclarationBlock", () => {
  it("adds the block after the rolled-up file, with one blank line between", () => {
    expect(withDeclarationBlock("export { }\n\n", "declare global {}")).toBe(
      "export { }\n\ndeclare global {}\n",
    );
  });
});
