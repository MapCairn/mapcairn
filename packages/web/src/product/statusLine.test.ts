// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STATUS_LINE } from "./productContent";

/** The umbrella package's version, which the release script keeps current. */
const SDK_VERSION: string = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../sdk/package.json"), "utf8"),
).version;

describe("the product page's status line", () => {
  it("says the SDK is before 1.0", () => {
    expect(STATUS_LINE).toContain("before version 1.0");
  });

  it("is removed or rewritten once the SDK reaches 1.0", () => {
    const major = Number.parseInt(SDK_VERSION.split(".")[0] ?? "0", 10);
    expect(
      major,
      `@mapcairn/sdk is ${SDK_VERSION}, so "${STATUS_LINE}" is no longer true. Remove or rewrite STATUS_LINE in packages/web/src/product/productContent.ts (and the matching sentence in llmsText.ts), then update this test and DESIGN.md.`,
    ).toBeLessThan(1);
  });
});
