// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { EXPECTED_INLINE_SCRIPTS } from "../scripts/expectedInlineScripts";
import { writeHeaders } from "./securityHeadersPlugin";

let root = "";

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it("allows the committed inline scripts and no other, whatever the pages carry", () => {
  root = mkdtempSync(join(tmpdir(), "mapcairn-headers-"));
  mkdirSync(join(root, "guide"));
  writeFileSync(join(root, "index.html"), "<script>unexpected()</script>");
  writeFileSync(
    join(root, "guide", "index.html"),
    '<svg style="display: none;"><defs><symbol id="a"></symbol></defs></svg><p>x</p>',
  );
  writeHeaders(root);
  const text = readFileSync(join(root, "_headers"), "utf8");
  for (const { hash } of EXPECTED_INLINE_SCRIPTS) {
    expect(text).toContain(`'${hash}'`);
  }
  expect(text.match(/'sha256-/g)?.length).toBe(EXPECTED_INLINE_SCRIPTS.length);
  expect(readFileSync(join(root, "guide", "index.html"), "utf8")).not.toContain(
    "display: none",
  );
});
