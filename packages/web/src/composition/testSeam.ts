import type { Services } from "@karta/core";

/**
 * A unique string that appears in the build output only when this module is
 * bundled. `packages/web/scripts/verifyNoTestSeam.mjs` searches the production
 * build for it, so renaming it means updating that script.
 */
export const TEST_SEAM_MARKER = "KARTA_TEST_SEAM_MARKER";

declare global {
  interface Window {
    /**
     * A partial {@link Services} that a Playwright `addInitScript` sets before
     * the page loads. Typed `unknown` because it is outside input: it is
     * checked before use.
     */
    __KARTA_TEST_SERVICES__?: unknown;
  }
}

const SERVICE_KEYS = [
  "createMapAdapter",
  "search",
  "location",
  "settings",
  "clipboard",
  "url",
  "theme",
  "preferences",
  "layers",
] as const satisfies readonly (keyof Services)[];

/** Fails to compile when a `Services` key is missing from {@link SERVICE_KEYS}. */
export type ServiceKeysAreExhaustive =
  Exclude<keyof Services, (typeof SERVICE_KEYS)[number]> extends never
    ? true
    : never;

/** Whether a value is plausible for a service key: a function for the factory, an object for the rest. */
function isPlausible(key: (typeof SERVICE_KEYS)[number], value: unknown) {
  return key === "createMapAdapter"
    ? typeof value === "function"
    : typeof value === "object" && value !== null;
}

/**
 * Reads the services a browser test put on `window.__KARTA_TEST_SERVICES__`.
 *
 * @remarks Never call this directly. `createServices` reaches it only through
 *   `import.meta.env.MODE !== "production"`, which the build replaces with a
 *   constant, so the call, this module and its strings are removed from a
 *   production bundle. Anything that is not a plain object is ignored, and an
 *   entry of the wrong kind (a string where a service belongs) is dropped on
 *   its own, so one bad entry cannot break the rest. Returns undefined when
 *   there is nothing usable.
 */
export function readTestOverrides(): Partial<Services> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = window.__KARTA_TEST_SERVICES__;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const accepted: Record<string, unknown> = {};
  for (const key of SERVICE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (isPlausible(key, value)) {
      accepted[key] = value;
    }
  }
  const keys = Object.keys(accepted);
  if (keys.length === 0) {
    return undefined;
  }
  console.info(`${TEST_SEAM_MARKER}: test services replace ${keys.join(", ")}`);
  return accepted as Partial<Services>;
}
