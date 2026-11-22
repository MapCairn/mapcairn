// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
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
import { writeHeaders } from "./securityHeadersPlugin";

let root = "";

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it("allows each inline script of every built page once, by hash", () => {
  root = mkdtempSync(join(tmpdir(), "mapcairn-headers-"));
  mkdirSync(join(root, "guide"));
  writeFileSync(join(root, "index.html"), "<script>one()</script>");
  writeFileSync(
    join(root, "guide", "index.html"),
    "<script>one()</script><script>two()</script>",
  );
  writeHeaders(root);
  const text = readFileSync(join(root, "_headers"), "utf8");
  const hash = (code: string) =>
    `'sha256-${createHash("sha256").update(code).digest("base64")}'`;
  expect(text).toContain(hash("one()"));
  expect(text).toContain(hash("two()"));
  expect(text.split(hash("one()")).length - 1).toBe(1);
});
