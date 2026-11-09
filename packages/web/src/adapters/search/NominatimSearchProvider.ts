import {
  type Bounds,
  type LatLng,
  PortAbortError,
  SearchError,
  type SearchOptions,
  type SearchProvider,
  type SearchResult,
} from "@karta/core";

const DEFAULT_ENDPOINT = "https://nominatim.openstreetmap.org";
const DEFAULT_LIMIT = 6;

/** The raw item Nominatim returns, for both `search` and `reverse` in `jsonv2` format. */
interface NominatimItem {
  place_id?: number | string;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  /** `[south, north, west, east]`, as strings. */
  boundingbox?: readonly string[];
}

/** Options for {@link NominatimSearchProvider}. */
export interface NominatimSearchProviderOptions {
  /**
   * The `fetch` to use. Read lazily from `globalThis` when omitted, so a test
   * or a polyfill installed after construction is still honoured.
   */
  readonly fetch?: typeof fetch;
  /** The service address. Defaults to `https://nominatim.openstreetmap.org`. */
  readonly endpoint?: string;
  /**
   * Comma-separated ISO 3166-1 alpha-2 country codes. Biases ranking toward
   * those countries without excluding results elsewhere. Search only.
   */
  readonly countryCodes?: string;
  /** Results per search when the caller gives no limit. Defaults to 6. */
  readonly defaultLimit?: number;
  /**
   * Whether the browser believes it is online, used to tell "offline" from
   * "failed" after a network error. Defaults to `navigator.onLine`.
   */
  readonly isOnline?: () => boolean;
}

function browserIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function defaultFetch(...args: Parameters<typeof fetch>) {
  return globalThis.fetch(...args);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toBounds(
  boundingbox: NominatimItem["boundingbox"],
): Bounds | undefined {
  if (boundingbox?.length !== 4) {
    return undefined;
  }
  const [south, north, west, east] = boundingbox.map((part) =>
    Number.parseFloat(part),
  );
  if (
    south === undefined ||
    north === undefined ||
    west === undefined ||
    east === undefined ||
    [south, north, west, east].some(Number.isNaN)
  ) {
    return undefined;
  }
  return { south, west, north, east };
}

/**
 * Splits Nominatim's long `display_name` into a short label and the rest.
 * Places without a `name` (house numbers, for example) keep the whole string
 * as the label.
 */
function toLabels(item: NominatimItem): {
  label: string;
  secondaryLabel?: string;
} {
  const displayName = item.display_name ?? "";
  const name = item.name?.trim() ?? "";
  if (name === "") {
    return { label: displayName };
  }
  const prefix = `${name}, `;
  const rest = displayName.startsWith(prefix)
    ? displayName.slice(prefix.length)
    : displayName === name
      ? ""
      : displayName;
  return rest === "" ? { label: name } : { label: name, secondaryLabel: rest };
}

function toSearchResult(item: NominatimItem): SearchResult | null {
  const lat = Number.parseFloat(item.lat ?? "");
  const lng = Number.parseFloat(item.lon ?? "");
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    item.place_id === undefined ||
    item.display_name === undefined
  ) {
    return null;
  }
  const bounds = toBounds(item.boundingbox);
  return {
    id: String(item.place_id),
    ...toLabels(item),
    centre: { lat, lng },
    ...(bounds ? { bounds } : {}),
  };
}

/**
 * A {@link SearchProvider} backed by OpenStreetMap's Nominatim service.
 *
 * @remarks Privacy: every search sends the query text to the OpenStreetMap
 *   Nominatim service, and the browser sends the user's IP address and user
 *   agent with it. A reverse lookup sends the position instead. Nothing is
 *   sent until the user searches or long-presses the map. The page's CSP must
 *   allow `connect-src https://nominatim.openstreetmap.org`.
 *
 *   Errors follow the port: a network failure is `SearchError("offline")`
 *   when `navigator.onLine` is false and `"failed"` otherwise, HTTP 429 is
 *   `"rate-limited"`, any other non-OK response, or a body that is not what
 *   Nominatim documents, is `"failed"`, and an aborted signal is a
 *   {@link PortAbortError}. A blank query resolves to no results without a
 *   request.
 */
export class NominatimSearchProvider implements SearchProvider {
  readonly #fetch: typeof fetch;
  readonly #endpoint: string;
  readonly #countryCodes: string | undefined;
  readonly #defaultLimit: number;
  readonly #isOnline: () => boolean;

  constructor(options: NominatimSearchProviderOptions = {}) {
    this.#fetch = options.fetch ?? defaultFetch;
    this.#endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
    this.#countryCodes = options.countryCodes;
    this.#defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
    this.#isOnline = options.isOnline ?? browserIsOnline;
  }

  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<readonly SearchResult[]> {
    throwIfAborted(options.signal);
    const trimmed = query.trim();
    if (trimmed === "") {
      return [];
    }
    const params = new URLSearchParams({
      q: trimmed,
      format: "jsonv2",
      limit: String(options.limit ?? this.#defaultLimit),
      addressdetails: "0",
    });
    if (this.#countryCodes) {
      params.set("countrycodes", this.#countryCodes);
    }
    if (options.bias) {
      const { west, north, east, south } = options.bias;
      params.set("viewbox", `${west},${north},${east},${south}`);
    }
    const payload = await this.#get("search", params, options.signal);
    if (!Array.isArray(payload)) {
      throw new SearchError("failed");
    }
    return payload
      .map((item) => toSearchResult(item as NominatimItem))
      .filter((result): result is SearchResult => result !== null);
  }

  async reverse(
    position: LatLng,
    options: Pick<SearchOptions, "signal"> = {},
  ): Promise<SearchResult | null> {
    throwIfAborted(options.signal);
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(position.lat),
      lon: String(position.lng),
    });
    const payload = await this.#get("reverse", params, options.signal);
    if (typeof payload !== "object" || payload === null || "error" in payload) {
      return null;
    }
    return toSearchResult(payload as NominatimItem);
  }

  /** Requests one Nominatim endpoint and returns the parsed JSON body. */
  async #get(
    path: "search" | "reverse",
    params: URLSearchParams,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#endpoint}/${path}?${params}`, {
        signal,
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new PortAbortError();
      }
      throw new SearchError(this.#isOnline() ? "failed" : "offline");
    }
    if (response.status === 429) {
      throw new SearchError("rate-limited");
    }
    if (!response.ok) {
      throw new SearchError(
        "failed",
        `Search failed: HTTP ${response.status}.`,
      );
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
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new PortAbortError();
  }
}
