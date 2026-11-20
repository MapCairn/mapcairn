// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { DESIGN_GUIDE_MARKER } from "../designGuide/DesignGuide";
import { HOST_THEMES } from "../designGuide/hostThemes";
import { loader } from "./design.host-theme";

function request(name: string | undefined) {
  return loader({
    params: { name },
    request: new Request("http://localhost/design/host-theme/x"),
    context: {},
  } as Parameters<typeof loader>[0]);
}

describe("/design/host-theme/:name route", () => {
  it("serves each theme as a stylesheet scoped to its selector", async () => {
    for (const [name, theme] of Object.entries(HOST_THEMES)) {
      const response = request(name);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/css; charset=utf-8",
      );
      expect(response.headers.get("X-Mapcairn-Design-Guide")).toBe(
        DESIGN_GUIDE_MARKER,
      );
      expect(body).toContain(theme.scope);
    }
  });

  it("gives the two themes different scopes", () => {
    const scopes = Object.values(HOST_THEMES).map((theme) => theme.scope);

    expect(new Set(scopes).size).toBe(scopes.length);
  });

  it("answers 404 for a name it does not hold", () => {
    expect(request("missing").status).toBe(404);
    expect(request("toString").status).toBe(404);
    expect(request(undefined).status).toBe(404);
  });
});
