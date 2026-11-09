import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DESIGN_GUIDE_PATH,
  designGuideRoutes,
  isDesignGuideEnabled,
} from "./designGuideRoutes";

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
  it("adds the /design route in development and e2e", () => {
    for (const mode of ["development", "e2e"]) {
      const routes = designGuideRoutes(mode);
      expect(routes).toHaveLength(1);
      expect(routes[0]?.path).toBe(DESIGN_GUIDE_PATH);
      expect(routes[0]?.file).toBe("./routes/design.tsx");
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
  async function routePathsIn(mode: string): Promise<(string | undefined)[]> {
    vi.stubEnv("MODE", mode);
    vi.resetModules();
    const { default: routes } = await import("./routes");
    return routes.map((entry) => entry.path);
  }

  it("has no /design route in a production build", async () => {
    const paths = await routePathsIn("production");
    expect(paths).not.toContain(DESIGN_GUIDE_PATH);
    expect(paths).toContain("privacy");
  });

  it("has the /design route in an e2e build", async () => {
    expect(await routePathsIn("e2e")).toContain(DESIGN_GUIDE_PATH);
  });
});
