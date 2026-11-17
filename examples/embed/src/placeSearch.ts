// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  type LatLng,
  PortAbortError,
  SearchError,
  type SearchOptions,
  type SearchProvider,
  type SearchResult,
  type SuggestionProvider,
  type SuggestOptions,
} from "@mapcairn/core";

/**
 * Where the example's place service answers. The `.invalid` top-level domain
 * is reserved and never resolves, and the example's local `fetch`
 * ({@link createPlacesFetch}) answers every request before it could leave the
 * page. A host with a real service points `endpoint` at its own server.
 */
export const PLACES_ENDPOINT = "https://places.invalid";

const DEFAULT_LIMIT = 6;
const EXTENT_LENGTH = 4;
/** The farthest, in degrees, that a place may be from a position to answer a reverse lookup. */
const NEAREST_RADIUS_DEGREES = 0.05;

/**
 * One place as the example's service sends it, a plain JSON object rather
 * than the SDK's {@link SearchResult}. `box` is `[south, west, north, east]`.
 */
export interface PlaceItem {
  readonly id?: string;
  readonly name?: string;
  readonly area?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly box?: readonly number[];
}

/** The part of `fetch` the providers use, so a host can supply any function of this shape. */
export type PlacesFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Options shared by {@link PlaceSearchProvider} and {@link PlaceSuggestionProvider}. */
export interface PlaceProviderOptions {
  /**
   * The `fetch` to use. The example passes {@link createPlacesFetch}; a host
   * with a service of its own passes the browser's `fetch`.
   */
  readonly fetch: PlacesFetch;
  /** The service address. Defaults to {@link PLACES_ENDPOINT}. */
  readonly endpoint?: string;
  /**
   * Whether the browser believes it is online, which tells "offline" from
   * "failed" after a network error. Defaults to `navigator.onLine`.
   */
  readonly isOnline?: () => boolean;
}

function browserIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new PortAbortError();
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toBounds(box: unknown): Bounds | undefined {
  if (
    !Array.isArray(box) ||
    box.length !== EXTENT_LENGTH ||
    !box.every(isFiniteNumber)
  ) {
    return undefined;
  }
  const [south, west, north, east] = box as [number, number, number, number];
  return { south, west, north, east };
}

/**
 * Maps one item of the service's answer to a {@link SearchResult}, or `null`
 * when it lacks an id, a name or a position, so one bad item does not fail
 * the whole answer.
 */
function toSearchResult(raw: unknown): SearchResult | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const item = raw as PlaceItem;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    !isFiniteNumber(item.lat) ||
    !isFiniteNumber(item.lon)
  ) {
    return null;
  }
  const bounds = toBounds(item.box);
  return {
    id: item.id,
    label: item.name,
    ...(item.area ? { secondaryLabel: item.area } : {}),
    centre: { lat: item.lat, lng: item.lon },
    ...(bounds ? { bounds } : {}),
  };
}

function toSearchResults(body: unknown): readonly SearchResult[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) {
    throw new SearchError("failed");
  }
  return results
    .map(toSearchResult)
    .filter((result): result is SearchResult => result !== null);
}

/**
 * Requests one path of the service and returns its parsed JSON. Turns every
 * failure into the port's errors: a cancelled signal is a `PortAbortError`, a
 * network failure is `offline` or `failed`, HTTP 429 is `rate-limited`, and
 * any other bad status or an unreadable body is `failed`.
 */
async function getJson(
  options: PlaceProviderOptions,
  path: string,
  params: URLSearchParams,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  throwIfAborted(signal);
  const endpoint = (options.endpoint ?? PLACES_ENDPOINT).replace(/\/$/, "");
  let response: Response;
  try {
    response = await options.fetch(`${endpoint}${path}?${params}`, {
      signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new PortAbortError();
    }
    const online = options.isOnline ?? browserIsOnline;
    throw new SearchError(online() ? "failed" : "offline");
  }
  if (response.status === 429) {
    throw new SearchError("rate-limited");
  }
  if (!response.ok) {
    throw new SearchError("failed", `Search failed: HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new PortAbortError();
    }
    throw new SearchError("failed");
  }
}

async function findPlaces(
  options: PlaceProviderOptions,
  path: "/search" | "/suggest",
  query: string,
  limit: number | undefined,
  signal: AbortSignal | undefined,
): Promise<readonly SearchResult[]> {
  throwIfAborted(signal);
  const trimmed = query.trim();
  if (trimmed === "") {
    return [];
  }
  const params = new URLSearchParams({
    q: trimmed,
    limit: String(limit ?? DEFAULT_LIMIT),
  });
  return toSearchResults(await getJson(options, path, params, signal));
}

/**
 * A {@link SearchProvider} for a plain JSON place service. It sends the query
 * text to `endpoint` and, for a reverse lookup, the position. It does not send
 * the `bias` box: the example's service has no use for it, and a provider that
 * sends one must say so in its privacy text.
 */
export class PlaceSearchProvider implements SearchProvider {
  readonly #options: PlaceProviderOptions;

  constructor(options: PlaceProviderOptions) {
    this.#options = options;
  }

  search(
    query: string,
    options: SearchOptions = {},
  ): Promise<readonly SearchResult[]> {
    return findPlaces(
      this.#options,
      "/search",
      query,
      options.limit,
      options.signal,
    );
  }

  async reverse(
    position: LatLng,
    options: Pick<SearchOptions, "signal"> = {},
  ): Promise<SearchResult | null> {
    const params = new URLSearchParams({
      lat: String(position.lat),
      lon: String(position.lng),
    });
    const body = await getJson(
      this.#options,
      "/nearest",
      params,
      options.signal,
    );
    if (typeof body !== "object" || body === null || !("result" in body)) {
      throw new SearchError("failed");
    }
    return toSearchResult(body.result);
  }
}

/**
 * A {@link SuggestionProvider} over the same service's `/suggest` path, for
 * text the person has only partly typed. It is a separate class, as the port
 * is separate, because a real service often has other terms for a request on
 * every keystroke.
 */
export class PlaceSuggestionProvider implements SuggestionProvider {
  readonly #options: PlaceProviderOptions;

  constructor(options: PlaceProviderOptions) {
    this.#options = options;
  }

  suggest(
    query: string,
    options: SuggestOptions = {},
  ): Promise<readonly SearchResult[]> {
    return findPlaces(
      this.#options,
      "/suggest",
      query,
      options.limit,
      options.signal,
    );
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function matchesAnywhere(place: PlaceItem, text: string): boolean {
  return `${place.name ?? ""} ${place.area ?? ""}`.toLowerCase().includes(text);
}

function matchesWordStart(place: PlaceItem, text: string): boolean {
  return (place.name ?? "")
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word.startsWith(text));
}

function nearestPlace(
  places: readonly PlaceItem[],
  position: LatLng,
): PlaceItem | null {
  let best: PlaceItem | null = null;
  let bestDistance = NEAREST_RADIUS_DEGREES ** 2;
  for (const place of places) {
    const distance =
      ((place.lat ?? 0) - position.lat) ** 2 +
      ((place.lon ?? 0) - position.lng) ** 2;
    if (distance <= bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * A `fetch` that answers the example's three paths from `places`, in memory,
 * so the providers run their real request, mapping and error code with no
 * network. `/search` matches the text anywhere in a name or area,
 * `/suggest` matches the start of a word in a name, and `/nearest` returns the
 * closest place within a small radius. Like the real `fetch`, it rejects with
 * an `AbortError` when the signal has fired. A host with a service of its own
 * passes none of this: the providers use `fetch`.
 */
export function createPlacesFetch(places: readonly PlaceItem[]): PlacesFetch {
  return (input, init) => {
    if (init?.signal?.aborted) {
      return Promise.reject(new DOMException("aborted", "AbortError"));
    }
    const url = new URL(input);
    const text = (url.searchParams.get("q") ?? "").toLowerCase();
    const limit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
    switch (url.pathname) {
      case "/search":
        return Promise.resolve(
          jsonResponse({
            results: places
              .filter((place) => matchesAnywhere(place, text))
              .slice(0, limit),
          }),
        );
      case "/suggest":
        return Promise.resolve(
          jsonResponse({
            results: places
              .filter((place) => matchesWordStart(place, text))
              .slice(0, limit),
          }),
        );
      case "/nearest":
        return Promise.resolve(
          jsonResponse({
            result: nearestPlace(places, {
              lat: Number(url.searchParams.get("lat")),
              lng: Number(url.searchParams.get("lon")),
            }),
          }),
        );
      default:
        return Promise.resolve(jsonResponse({}, 404));
    }
  };
}
