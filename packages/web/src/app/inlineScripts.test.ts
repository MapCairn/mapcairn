// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../constants/securityHeaders";
import { COPY_CODE_SCRIPT } from "./copyCodeScript";
import { MAP_LINK_REDIRECT_SCRIPT } from "./mapLinkRedirect";
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

/*
 * The site has three inline scripts: the theme bootstrap every page runs in its
 * head, and the product page's redirect for old map links and its copy buttons. Each is allowed by
 * its own hash and nothing else inline is, so a change to any script fails
 * here until its hash is updated in both files.
 */
describe("the inline scripts' CSP hashes", () => {
  const expected = [
    cspHash(THEME_BOOTSTRAP_SCRIPT),
    cspHash(MAP_LINK_REDIRECT_SCRIPT),
    cspHash(COPY_CODE_SCRIPT),
  ];

  it("are the only script hashes the policy built in securityHeaders.ts allows", () => {
    expect(hashesIn(buildContentSecurityPolicy())).toEqual(expected);
    expect(hashesIn(buildContentSecurityPolicy("nonce"))).toEqual(expected);
  });

  it("are the only script hashes in public/_headers", () => {
    expect(hashesIn(headersFile)).toEqual(expected);
  });
});
