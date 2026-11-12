// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../constants/securityHeaders";
import { THEME_BOOTSTRAP_SCRIPT } from "./themeBootstrap";

/** The CSP source for an inline script: `'sha256-<base64 digest>'`. */
function cspHash(script: string): string {
  const digest = createHash("sha256").update(script, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

/** Every `'sha256-...'` source in a policy or file. */
function hashesIn(text: string): string[] {
  return text.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? [];
}

const headersFile = readFileSync(
  path.join(__dirname, "../../public/_headers"),
  "utf8",
);

describe("the theme bootstrap script's CSP hash", () => {
  const expected = cspHash(THEME_BOOTSTRAP_SCRIPT);

  it("is the only script hash the policy built in securityHeaders.ts allows", () => {
    expect(hashesIn(buildContentSecurityPolicy())).toEqual([expected]);
    expect(hashesIn(buildContentSecurityPolicy("nonce"))).toEqual([expected]);
  });

  it("is the only script hash in public/_headers", () => {
    expect(hashesIn(headersFile)).toEqual([expected]);
  });
});
