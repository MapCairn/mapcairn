// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildHeadersFile,
  parseDirectives,
} from "./securityHeaders";

const HOST_HEADERS = readFileSync(
  new URL("../../../packages/web/public/_headers", import.meta.url),
  "utf8",
);

function hostPolicy(): Record<string, string[]> {
  const line = HOST_HEADERS.split("\n").find((text) =>
    text.trim().startsWith("Content-Security-Policy:"),
  );
  return parseDirectives((line ?? "").replace(/^\s*[\w-]+:\s*/, ""));
}

describe("buildContentSecurityPolicy", () => {
  it("allows only the inline scripts it is given, by hash", () => {
    const policy = parseDirectives(buildContentSecurityPolicy(["sha256-abc="]));
    expect(policy["script-src"]).toContain("'sha256-abc='");
    expect(policy["script-src"]).not.toContain("'unsafe-inline'");
    expect(policy["style-src"]).toEqual(["'self'"]);
  });

  it("is never looser than the reference site's policy", () => {
    const docs = parseDirectives(buildContentSecurityPolicy(["sha256-abc="]));
    const host = hostPolicy();
    for (const [directive, sources] of Object.entries(docs)) {
      const allowed = host[directive];
      expect(allowed, `the host sets ${directive}`).toBeDefined();
      for (const source of sources) {
        if (source.startsWith("'sha256-")) {
          continue;
        }
        expect(allowed, `${directive} ${source}`).toContain(source);
      }
    }
  });

  it("sets every directive the reference site sets that restricts a fetch", () => {
    const docs = Object.keys(
      parseDirectives(buildContentSecurityPolicy([])),
    ).sort();
    for (const directive of [
      "default-src",
      "object-src",
      "base-uri",
      "form-action",
      "frame-ancestors",
      "frame-src",
    ]) {
      expect(docs).toContain(directive);
    }
  });
});

describe("buildHeadersFile", () => {
  const file = buildHeadersFile(["sha256-abc="]);

  it("repeats the reference site's security headers other than the policy", () => {
    for (const name of [
      "X-Content-Type-Options: nosniff",
      "X-Frame-Options: DENY",
      "Referrer-Policy: strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy: same-origin",
      "Cross-Origin-Resource-Policy: same-origin",
      "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
    ]) {
      expect(HOST_HEADERS).toContain(name);
      expect(file).toContain(name);
    }
  });

  it("denies every permission the reference site denies, and geolocation too", () => {
    const line = (text: string) =>
      text
        .split("\n")
        .find((row) => row.trim().startsWith("Permissions-Policy:")) ?? "";
    for (const denied of [
      "camera=()",
      "microphone=()",
      "interest-cohort=()",
      "browsing-topics=()",
    ]) {
      expect(line(HOST_HEADERS)).toContain(denied);
      expect(line(file)).toContain(denied);
    }
    expect(line(file)).toContain("geolocation=()");
  });

  it("caches the hashed build assets for a year and leaves pages to revalidate", () => {
    expect(file).toContain(
      "/docs/assets/*\n  Cache-Control: public, max-age=31536000, immutable",
    );
  });
});
