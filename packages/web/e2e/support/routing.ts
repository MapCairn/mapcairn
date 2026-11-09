import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/adapters/routing/fixtures",
);

/** Every request to the routing service, whatever the test scripts. */
export const ROUTING_PATTERN = /valhalla1\.openstreetmap\.de/;

/** How the mocked routing service answers. */
export type RoutingMode =
  /** A recorded answer. */
  | "ok"
  /** HTTP 429, as when the service limits a visitor. */
  | "busy"
  /** HTTP 503, as when the service is overloaded. */
  | "unavailable"
  /** HTTP 400 with the service's "no path" error. */
  | "no-route"
  /** The connection fails, as when the visitor is offline. */
  | "offline";

/** What a test can change about the mocked routing service, and read back. */
export interface RoutingScript {
  /** How every later request is answered. */
  mode: RoutingMode;
  /** How long each answer waits, so a test can press Cancel meanwhile. */
  delayMs: number;
  /** Every request, in order: the endpoint and its decoded `json` parameter. */
  readonly requests: { endpoint: string; body: Record<string, unknown> }[];
}

function fixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

function endpointOf(url: URL): string {
  return url.pathname.replace(/^\//, "");
}

async function answer(route: Route, script: RoutingScript): Promise<void> {
  const url = new URL(route.request().url());
  const endpoint = endpointOf(url);
  const body = JSON.parse(url.searchParams.get("json") ?? "{}") as Record<
    string,
    unknown
  >;
  script.requests.push({ endpoint, body });
  if (script.delayMs > 0) {
    await new Promise((done) => setTimeout(done, script.delayMs));
  }
  const cors = { "access-control-allow-origin": "*" };
  switch (script.mode) {
    case "offline":
      await route.abort("internetdisconnected");
      return;
    case "busy":
      await route.fulfill({
        status: 429,
        headers: cors,
        body: "Too Many Requests",
      });
      return;
    case "unavailable":
      await route.fulfill({ status: 503, headers: cors, body: "Unavailable" });
      return;
    case "no-route":
      await route.fulfill({
        status: 400,
        headers: cors,
        contentType: "application/json",
        body: fixture("error-no-path.json"),
      });
      return;
    case "ok": {
      const locations = Array.isArray(body.locations) ? body.locations : [];
      const file =
        endpoint === "isochrone"
          ? "isochrone-polygon.json"
          : locations.length > 2
            ? "route-three-stops.json"
            : "route-paris-lyon.json";
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: fixture(file),
      });
    }
  }
}

/**
 * Answers the routing service from the committed adapter fixtures, so the
 * suite exercises the real adapter and decoder with no live service, and
 * records what was asked. Change `script.mode` to script a failure.
 */
export async function mockRoutingService(page: Page): Promise<RoutingScript> {
  const script: RoutingScript = { mode: "ok", delayMs: 0, requests: [] };
  await page.route(ROUTING_PATTERN, (route) => answer(route, script));
  return script;
}
