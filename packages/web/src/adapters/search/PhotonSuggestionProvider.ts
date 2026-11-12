import {
  type Bounds,
  PortAbortError,
  SearchError,
  type SearchErrorKind,
  type SearchResult,
  type SuggestionProvider,
  type SuggestOptions,
} from "@mapcairn/core";
import { defaultFetch, isAbortError, throwIfAborted } from "../shared/fetch";
import { RequestSpacer } from "../shared/RequestSpacer";

const DEFAULT_ENDPOINT = "https://photon.komoot.io/api/";
const DEFAULT_LIMIT = 5;

/**
 * The least time between the starts of two suggestion requests. The public
 * Photon server asks only that clients are fair, and the caller already waits
 * for a pause in typing, so this is a floor under a burst, not the pacing.
 */
const DEFAULT_MIN_INTERVAL_MS = 250;

/** How long one request may take before it counts as failed. */
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Photon's language for names and labels. The app is English only, and `en`
 * is one of the languages Photon indexes.
 */
const LANGUAGE = "en";

/** The properties of one Photon feature that this adapter reads. */
interface PhotonProperties {
  osm_id?: number;
  osm_type?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  district?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  /** `[west, north, east, south]`. */
  extent?: readonly number[];
}

/** One feature of Photon's GeoJSON answer. */
interface PhotonFeature {
  geometry?: { type?: string; coordinates?: readonly number[] };
  properties?: PhotonProperties;
}

/** Options for {@link PhotonSuggestionProvider}. */
export interface PhotonSuggestionProviderOptions {
  /**
   * The `fetch` to use. Read lazily from `globalThis` when omitted, so a test
   * or a polyfill installed after construction is still honoured.
   */
  readonly fetch?: typeof fetch;
  /**
   * The service address. Defaults to the public server at
   * `https://photon.komoot.io/api/`. A host with commercial use points this at
   * its own Photon server.
   */
  readonly endpoint?: string;
  /** Suggestions per request when the caller gives no limit. Defaults to 5. */
  readonly defaultLimit?: number;
  /**
   * Whether the browser believes it is online, used to tell "offline" from
   * "failed" after a network error. Defaults to `navigator.onLine`.
   */
  readonly isOnline?: () => boolean;
  /** The least time between the starts of two requests. Defaults to 250. */
  readonly minIntervalMs?: number;
  /** How long a request may take before it fails. Defaults to 4000. */
  readonly timeoutMs?: number;
}

function browserIsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toBounds(extent: PhotonProperties["extent"]): Bounds | undefined {
  if (extent?.length !== 4 || !extent.every(isFiniteNumber)) {
    return undefined;
  }
  const [west, north, east, south] = extent as readonly [
    number,
    number,
    number,
    number,
  ];
  return { south, west, north, east };
}

function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** The street line of an address, such as "12 Long Street", or nothing. */
function streetLine(properties: PhotonProperties): string {
  return [text(properties.housenumber), text(properties.street)]
    .filter((part) => part !== "")
    .join(" ");
}

/**
 * Splits a feature into a short label and the places around it. A feature
 * with no name, such as a house, is labelled by its street line. Parts that
 * repeat the label or one another are dropped.
 */
function toLabels(properties: PhotonProperties): {
  label: string;
  secondaryLabel?: string;
} | null {
  const name = text(properties.name);
  const street = streetLine(properties);
  const label = name === "" ? street : name;
  if (label === "") {
    return null;
  }
  const parts = [
    name === "" ? "" : street,
    text(properties.district),
    text(properties.locality),
    text(properties.city),
    text(properties.county),
    text(properties.state),
    text(properties.country),
  ];
  const secondary = parts.filter(
    (part, index) =>
      part !== "" && part !== label && parts.indexOf(part) === index,
  );
  return secondary.length === 0
    ? { label }
    : { label, secondaryLabel: secondary.join(", ") };
}

function toSearchResult(feature: PhotonFeature): SearchResult | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties;
  if (
    feature.geometry?.type !== "Point" ||
    coordinates?.length === undefined ||
    coordinates.length < 2 ||
    !isFiniteNumber(coordinates[0]) ||
    !isFiniteNumber(coordinates[1]) ||
    properties === undefined
  ) {
    return null;
  }
  const labels = toLabels(properties);
  if (labels === null) {
    return null;
  }
  const [lng, lat] = coordinates;
  const bounds = toBounds(properties.extent);
  const osm =
    properties.osm_type !== undefined && isFiniteNumber(properties.osm_id)
      ? `${properties.osm_type}${properties.osm_id}`
      : `${lat},${lng}`;
  return {
    id: `photon:${osm}`,
    ...labels,
    centre: { lat, lng },
    ...(bounds ? { bounds } : {}),
  };
}

/**
 * A {@link SuggestionProvider} backed by Photon, the search-as-you-type
 * geocoder that komoot runs on OpenStreetMap data.
 *
 * @remarks Privacy: every request sends the text typed so far to the Photon
 *   server, and the browser sends the person's IP address and user agent with
 *   it, but no cookies and no referrer. The page's CSP must allow
 *   `connect-src https://photon.komoot.io`. The public server states only that
 *   clients should be fair and gives no terms for commercial use, so a host
 *   with commercial use runs its own Photon server and passes it as
 *   `endpoint`.
 *
 *   Requests start at least `minIntervalMs` apart, and each fails after
 *   `timeoutMs`. A signal that fires while a request is queued abandons it
 *   without sending it.
 *
 *   Errors follow the port: a network failure is `SearchError("offline")` when
 *   `navigator.onLine` is false and `"failed"` otherwise, HTTP 429 is
 *   `"rate-limited"`, a timeout, any other non-OK response, or a body that is
 *   not Photon's GeoJSON is `"failed"`, and an aborted signal is a
 *   {@link PortAbortError}. A blank query resolves to no suggestions without a
 *   request. Features that are not a point with a name or a street are left
 *   out.
 */
export class PhotonSuggestionProvider implements SuggestionProvider {
  readonly #fetch: typeof fetch;
  readonly #endpoint: string;
  readonly #defaultLimit: number;
  readonly #isOnline: () => boolean;
  readonly #timeoutMs: number;
  readonly #spacer: RequestSpacer;

  constructor(options: PhotonSuggestionProviderOptions = {}) {
    this.#fetch = options.fetch ?? defaultFetch;
    this.#endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.#defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
    this.#isOnline = options.isOnline ?? browserIsOnline;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#spacer = new RequestSpacer(
      options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    );
  }

  async suggest(
    query: string,
    options: SuggestOptions = {},
  ): Promise<readonly SearchResult[]> {
    throwIfAborted(options.signal);
    const trimmed = query.trim();
    if (trimmed === "") {
      return [];
    }
    const params = new URLSearchParams({
      q: trimmed,
      limit: String(options.limit ?? this.#defaultLimit),
      lang: LANGUAGE,
    });
    await this.#spacer.wait(options.signal);
    // The signal may have fired between the turn and this line.
    throwIfAborted(options.signal);
    const payload = await this.#get(params, options.signal);
    const features = (payload as { features?: unknown } | null)?.features;
    if (!Array.isArray(features)) {
      throw new SearchError("failed");
    }
    const seen = new Set<string>();
    return features
      .map((feature) => toSearchResult(feature as PhotonFeature))
      .filter((result): result is SearchResult => {
        if (result === null || seen.has(result.id)) {
          return false;
        }
        seen.add(result.id);
        return true;
      });
  }

  /**
   * Requests the endpoint and returns the parsed JSON body. The timeout covers
   * the wait for the response and for its body.
   */
  async #get(
    params: URLSearchParams,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const own = new AbortController();
    const forward = () => own.abort();
    signal?.addEventListener("abort", forward, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      own.abort();
    }, this.#timeoutMs);
    const failure = (
      error: unknown,
      kind: SearchErrorKind,
    ): SearchError | PortAbortError => {
      if (signal?.aborted) {
        return new PortAbortError();
      }
      if (timedOut) {
        return new SearchError("failed", "Suggestions timed out.");
      }
      if (isAbortError(error)) {
        return new PortAbortError();
      }
      return new SearchError(kind);
    };
    try {
      let response: Response;
      try {
        response = await this.#fetch(`${this.#endpoint}?${params}`, {
          signal: own.signal,
          headers: { Accept: "application/json" },
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      } catch (error) {
        throw failure(error, this.#isOnline() ? "failed" : "offline");
      }
      if (response.status === 429) {
        throw new SearchError("rate-limited");
      }
      if (!response.ok) {
        throw new SearchError(
          "failed",
          `Suggestions failed: HTTP ${response.status}.`,
        );
      }
      try {
        return await response.json();
      } catch (error) {
        throw failure(error, "failed");
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    }
  }
}
