import { describe, expect, it } from "vitest";
import { buildPageMeta } from "./buildPageMeta";

/**
 * Finds the JSON-LD descriptor `buildPageMeta` emits without depending on
 * its position in the returned array.
 */
function getJsonLd(
  meta: ReturnType<typeof buildPageMeta>,
): Record<string, unknown> {
  const entry = meta.find(
    (descriptor): descriptor is { "script:ld+json": Record<string, unknown> } =>
      "script:ld+json" in descriptor,
  );
  if (!entry) {
    throw new Error("buildPageMeta did not return a script:ld+json entry");
  }
  return entry["script:ld+json"];
}

describe("buildPageMeta", () => {
  it("describes MapCairn as a domain-neutral mapping application", () => {
    const jsonLd = getJsonLd(
      buildPageMeta({
        title: "Test title",
        description: "Test description",
        url: "https://example.com",
      }),
    );

    expect(jsonLd["@type"]).toBe("WebApplication");
    expect(jsonLd.applicationCategory).toBe("MappingApplication");
    const keywords = jsonLd.keywords as string[];
    expect(keywords).toContain("geospatial data");
    expect(JSON.stringify(jsonLd)).not.toMatch(/Gauteng|apartheid|township/i);
  });
});
