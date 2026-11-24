// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DESIGN_GUIDE_PATH,
  DESIGN_HOST_THEME_PATH,
  DESIGN_TWO_MAPS_PATH,
  designGuideRoutes,
  isDesignGuideEnabled,
} from "./designGuideRoutes";
import { routePaths } from "./routePaths";

describe("isDesignGuideEnabled", () => {
  it("is on for the dev server and the e2e build", () => {
    expect(isDesignGuideEnabled("development")).toBe(true);
    expect(isDesignGuideEnabled("e2e")).toBe(true);
  });

  it("is off for a production build", () => {
    expect(isDesignGuideEnabled("production")).toBe(false);
  });

  it("fails closed for any other or missing mode", () => {
    expect(isDesignGuideEnabled("staging")).toBe(false);
    expect(isDesignGuideEnabled("test")).toBe(false);
    expect(isDesignGuideEnabled("")).toBe(false);
    expect(isDesignGuideEnabled(undefined)).toBe(false);
  });
});

describe("designGuideRoutes", () => {
  it("adds the /design route, the host theme stylesheets and the two-maps page in development and e2e", () => {
    for (const mode of ["development", "e2e"]) {
      const routes = designGuideRoutes(mode);
      expect(routes).toHaveLength(3);
      expect(routes[0]?.path).toBe(DESIGN_GUIDE_PATH);
      expect(routes[0]?.file).toBe("./routes/design.tsx");
      expect(routes[1]?.path).toBe(DESIGN_HOST_THEME_PATH);
      expect(routes[1]?.file).toBe("./routes/design.host-theme.ts");
      expect(routes[2]?.path).toBe(DESIGN_TWO_MAPS_PATH);
      expect(routes[2]?.file).toBe("./routes/design.two-maps.tsx");
    }
  });

  it("adds nothing in production", () => {
    expect(designGuideRoutes("production")).toEqual([]);
  });
});

describe("the route table", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** Loads `routes.ts` afresh under a build mode. */
  async function routePathsIn(mode: string): Promise<string[]> {
    vi.stubEnv("MODE", mode);
    vi.resetModules();
    const { default: routes } = await import("./routes");
    return routePaths(routes);
  }

  it("has no /design route in a production build", async () => {
    const paths = await routePathsIn("production");
    expect(paths).not.toContain(DESIGN_GUIDE_PATH);
    expect(paths).not.toContain(DESIGN_HOST_THEME_PATH);
    expect(paths).not.toContain(DESIGN_TWO_MAPS_PATH);
    expect(paths).toContain("privacy");
  });

  it("has the /design route in an e2e build", async () => {
    const paths = await routePathsIn("e2e");
    expect(paths).toContain(DESIGN_GUIDE_PATH);
    expect(paths).toContain(DESIGN_HOST_THEME_PATH);
    expect(paths).toContain(DESIGN_TWO_MAPS_PATH);
  });
});
