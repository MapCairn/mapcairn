import { detailUrl, feedUrl } from "../layers/feed";
import { LayerError } from "../ports/errors";
import type {
  LayerDetailRequest,
  LayerFeature,
  LayerLoadRequest,
  LayerSource,
} from "../ports/layers";

type Outcome =
  | { readonly kind: "features"; readonly features: readonly LayerFeature[] }
  | { readonly kind: "failure"; readonly error: "network" | "invalid" };

/** A request the fake received, with the URL a real source would fetch. */
export type RecordedLayerRequest<T> = T & { readonly url: string };

/**
 * An in-memory {@link LayerSource}.
 *
 * How to script it, per layer id: `setFeatures` for what `load` returns
 * (none means an `empty` error), `fail` to reject with `network` or
 * `invalid`, `setDetail` for what `loadDetail` returns, and `hold` to make
 * every load wait until the returned function is called. The last call for a
 * layer wins. `requests` and `detailRequests` record what was asked, with the
 * URL the real source would have requested, worked out by the core URL
 * helpers. A detail URL off the definition's declared origins is refused
 * with `invalid`, as the real source does. Aborts are honoured before and
 * after a hold.
 */
export class FakeLayerSource implements LayerSource {
  readonly requests: RecordedLayerRequest<LayerLoadRequest>[] = [];
  readonly detailRequests: RecordedLayerRequest<LayerDetailRequest>[] = [];

  readonly #outcomes = new Map<string, Outcome>();
  readonly #details = new Map<string, readonly LayerFeature[]>();
  #held: Promise<void> | null = null;

  /** Makes `load` for a layer return these features. */
  setFeatures(layerId: string, features: readonly LayerFeature[]): void {
    this.#outcomes.set(layerId, { kind: "features", features });
  }

  /** Makes `load` for a layer reject with a `LayerError` of this kind. */
  fail(layerId: string, error: "network" | "invalid"): void {
    this.#outcomes.set(layerId, { kind: "failure", error });
  }

  /** Makes `loadDetail` for a layer return these shapes. */
  setDetail(layerId: string, shapes: readonly LayerFeature[]): void {
    this.#details.set(layerId, shapes);
  }

  /** Makes every load wait until the returned function is called. */
  hold(): () => void {
    let release!: () => void;
    this.#held = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      this.#held = null;
      release();
    };
  }

  async load(request: LayerLoadRequest): Promise<readonly LayerFeature[]> {
    const { definition, controls, now, signal } = request;
    this.requests.push({ ...request, url: feedUrl(definition, controls, now) });
    await this.#wait(signal);
    const outcome = this.#outcomes.get(definition.id);
    if (outcome?.kind === "failure") {
      throw new LayerError(outcome.error);
    }
    if (!outcome || outcome.features.length === 0) {
      throw new LayerError("empty");
    }
    return outcome.features;
  }

  async loadDetail(
    request: LayerDetailRequest,
  ): Promise<readonly LayerFeature[]> {
    const url = detailUrl(request.definition, request.feature);
    if (url === null) {
      throw new LayerError("invalid", "The detail URL is not allowed.");
    }
    this.detailRequests.push({ ...request, url });
    await this.#wait(request.signal);
    const shapes = this.#details.get(request.definition.id) ?? [];
    if (shapes.length === 0) {
      throw new LayerError("empty");
    }
    return shapes;
  }

  async #wait(signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted) {
      throw new LayerError("aborted");
    }
    if (this.#held) {
      await this.#held;
    }
    if (signal?.aborted) {
      throw new LayerError("aborted");
    }
  }
}
