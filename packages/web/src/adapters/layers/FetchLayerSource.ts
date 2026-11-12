// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  type DecoderRegistry,
  decodeDetail,
  decodeFeed,
  decodeIdentify,
  detailUrl,
  feedUrl,
  identifyUrl,
  type LayerDetailRequest,
  LayerError,
  type LayerFeature,
  type LayerIdentifyRequest,
  type LayerLoadRequest,
  type LayerSource,
  loadsFeatures,
  maxAgeFromCacheControl,
  SharedResponseCache,
} from "@mapcairn/core";
import { defaultFetch } from "../shared/fetch";
import { NO_BYTE_LIMIT, readJsonWithin } from "./readJson";

/**
 * The most bytes of an identify answer that are read: 1 MiB. A service
 * answers a tap with a handful of features, and this source decodes at most
 * `MAX_IDENTIFIED_FEATURES` of them, so an answer past this is not one a
 * layer meant to send and is refused as `invalid` without being held in
 * memory whole.
 */
export const MAX_IDENTIFY_RESPONSE_BYTES = 1024 * 1024;

/** A parsed answer, with the `Cache-Control` it came with. */
interface FetchedJson {
  readonly value: unknown;
  readonly cacheControl: string | null;
}

/**
 * The URL a tap asks, which must build and must be `https`.
 *
 * @throws `LayerError` `invalid` when core cannot build it (a zoom or a
 *   coordinate that is not finite) or the result is not an `https` URL.
 */
function identifyRequestUrl({
  definition,
  controls,
  now,
  at,
}: LayerIdentifyRequest): string {
  try {
    const url = identifyUrl(definition, controls, now, at);
    if (new URL(url).protocol === "https:") {
      return url;
    }
  } catch (error) {
    throw new LayerError(
      "invalid",
      `The identify URL could not be built: ${String(error)}`,
    );
  }
  throw new LayerError("invalid", "The identify URL is not https.");
}

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

/**
 * The {@link LayerSource} for every layer: it fills the definition's URL
 * template, fetches it, and decodes it with the decoder the definition names.
 * Nothing here knows a provider.
 *
 * @remarks Requests send no cookies and no referrer. Feed responses are kept
 *   in a {@link SharedResponseCache} for their `Cache-Control` `max-age`, and
 *   a request in flight is shared, so several layers split from one feed cost
 *   one request. A detail URL comes from the provider's data, so it is
 *   requested only when it is `https` on an origin the definition declares.
 *
 *   `identify` never uses that cache: a tap's URL is different every time, so
 *   a kept answer is never read again and would push feed responses out,
 *   and the answer is not shared with another request in flight. It ignores
 *   `Cache-Control`, and reads at most {@link MAX_IDENTIFY_RESPONSE_BYTES}.
 *   A 401 or 403 is a `network` failure until the port has an `unauthorised`
 *   kind.
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

  async identify(
    request: LayerIdentifyRequest,
  ): Promise<readonly LayerFeature[]> {
    const { definition, at, signal } = request;
    const { value } = await this.#fetchJson(
      identifyRequestUrl(request),
      signal,
      MAX_IDENTIFY_RESPONSE_BYTES,
    );
    return decodeIdentify(definition, value, this.#decoders, at);
  }

  /** A feed or detail answer, kept and shared as the cache decides. `minimumSeconds` is a floor under the provider's `max-age`. */
  #get(
    url: string,
    signal: AbortSignal | undefined,
    minimumSeconds = 0,
  ): Promise<unknown> {
    return this.#cache.load(
      url,
      async (requestSignal) => {
        const { value, cacheControl } = await this.#fetchJson(
          url,
          requestSignal,
          NO_BYTE_LIMIT,
        );
        return {
          value,
          maxAgeSeconds: Math.max(
            minimumSeconds,
            maxAgeFromCacheControl(cacheControl),
          ),
        };
      },
      signal,
    );
  }

  /**
   * Asks for `url` and parses the answer as JSON, with no cookies, no
   * referrer and no storage: the one fetch every request goes through.
   *
   * @throws `LayerError` `aborted` when `signal` fires, before or during the
   *   request or while the body is read; `network` when the request fails or
   *   the status is not 2xx; `invalid` when the body is over `maxBytes` or
   *   is not JSON.
   */
  async #fetchJson(
    url: string,
    signal: AbortSignal | undefined,
    maxBytes: number,
  ): Promise<FetchedJson> {
    if (signal?.aborted) {
      throw new LayerError("aborted");
    }
    let response: Response;
    try {
      response = await this.#fetch(url, {
        ...(signal ? { signal } : {}),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        mode: "cors",
      });
    } catch (error) {
      throw signal?.aborted
        ? new LayerError("aborted")
        : new LayerError("network", `The request failed: ${String(error)}`);
    }
    if (!response.ok) {
      throw new LayerError(
        "network",
        `The provider answered ${response.status}.`,
      );
    }
    try {
      return {
        value: await readJsonWithin(response, maxBytes),
        cacheControl: response.headers.get("cache-control"),
      };
    } catch (error) {
      throw signal?.aborted ? new LayerError("aborted") : error;
    }
  }
}
