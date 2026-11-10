import {
  createDecoderRegistry,
  type DecoderRegistry,
  decodeDetail,
  decodeFeed,
  detailUrl,
  feedUrl,
  type LayerDetailRequest,
  LayerError,
  type LayerFeature,
  type LayerLoadRequest,
  type LayerSource,
  loadsFeatures,
  maxAgeFromCacheControl,
  SharedResponseCache,
} from "@mapcairn/core";

/** Options for {@link FetchLayerSource}. */
export interface FetchLayerSourceOptions {
  /**
   * The `fetch` to use. Read lazily from `globalThis` when omitted, so a test
   * can replace it after construction.
   */
  readonly fetch?: typeof fetch;
  /** Decoders by name. Defaults to the built-ins (`geojson`). */
  readonly decoders?: DecoderRegistry;
  /** The clock for the response cache. Defaults to `Date.now`. */
  readonly now?: () => number;
}

function defaultFetch(...args: Parameters<typeof fetch>) {
  return globalThis.fetch(...args);
}

/**
 * The {@link LayerSource} for every feed layer: it fills the definition's URL
 * template, fetches it, and decodes it with the decoder the definition names.
 * Nothing here knows a provider.
 *
 * @remarks Requests send no cookies and no referrer. Responses are kept in a
 *   {@link SharedResponseCache} for their `Cache-Control` `max-age`, and a
 *   request in flight is shared, so several layers split from one feed cost
 *   one request. A detail URL comes from the provider's data, so it is
 *   requested only when it is `https` on an origin the definition declares.
 */
export class FetchLayerSource implements LayerSource {
  readonly #fetch: typeof fetch;
  readonly #decoders: DecoderRegistry;
  readonly #cache: SharedResponseCache<unknown>;

  constructor(options: FetchLayerSourceOptions = {}) {
    this.#fetch = options.fetch ?? defaultFetch;
    this.#decoders = options.decoders ?? createDecoderRegistry();
    this.#cache = new SharedResponseCache({ now: options.now ?? Date.now });
  }

  async load(request: LayerLoadRequest): Promise<readonly LayerFeature[]> {
    const { definition, controls, now, signal, area } = request;
    const cacheSeconds =
      loadsFeatures(definition) && definition.source.kind === "feed"
        ? (definition.source.cacheSeconds ?? 0)
        : 0;
    const raw = await this.#get(
      feedUrl(definition, controls, now, area),
      signal,
      cacheSeconds,
    );
    return decodeFeed(definition, raw, this.#decoders);
  }

  async loadDetail(
    request: LayerDetailRequest,
  ): Promise<readonly LayerFeature[]> {
    const url = detailUrl(request.definition, request.feature);
    if (url === null) {
      throw new LayerError("invalid", "The detail URL is not allowed.");
    }
    const raw = await this.#get(url, request.signal);
    return decodeDetail(request.definition, raw, this.#decoders);
  }

  #get(
    url: string,
    signal: AbortSignal | undefined,
    minimumSeconds = 0,
  ): Promise<unknown> {
    return this.#cache.load(
      url,
      async (requestSignal) => {
        let response: Response;
        try {
          response = await this.#fetch(url, {
            signal: requestSignal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
            mode: "cors",
          });
        } catch (error) {
          throw requestSignal.aborted
            ? new LayerError("aborted")
            : new LayerError("network", `The request failed: ${String(error)}`);
        }
        if (!response.ok) {
          throw new LayerError(
            "network",
            `The provider answered ${response.status}.`,
          );
        }
        let value: unknown;
        try {
          value = await response.json();
        } catch {
          throw new LayerError("invalid", "The response is not JSON.");
        }
        return {
          value,
          maxAgeSeconds: Math.max(
            minimumSeconds,
            maxAgeFromCacheControl(response.headers.get("cache-control")),
          ),
        };
      },
      signal,
    );
  }
}
