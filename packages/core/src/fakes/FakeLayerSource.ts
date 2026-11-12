// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { detailUrl, feedUrl } from "../layers/feed";
import { identifyUrl } from "../layers/identify";
import { LayerError } from "../ports/errors";
import type {
  LayerDetailRequest,
  LayerFeature,
  LayerIdentifyRequest,
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
 *
 * `identify` is scripted apart from `load`, also per layer id, so a layer
 * can be both loaded and identified without one affecting the other:
 * `setIdentified` for what it finds (a layer it was not told about finds
 * nothing and resolves to an empty list, never `empty`), `failIdentify` to
 * reject with `network` or `invalid`, and `holdIdentify(layerId)` to make
 * that one layer's identifies wait until the returned function is called.
 * `hold` does not hold an identify, and `holdIdentify` does not hold a load.
 * `identifyRequests` records what was asked, with the URL the real source
 * would have requested.
 */
export class FakeLayerSource implements LayerSource {
  readonly requests: RecordedLayerRequest<LayerLoadRequest>[] = [];
  readonly detailRequests: RecordedLayerRequest<LayerDetailRequest>[] = [];
  readonly identifyRequests: RecordedLayerRequest<LayerIdentifyRequest>[] = [];

  readonly #outcomes = new Map<string, Outcome>();
  readonly #identified = new Map<string, Outcome>();
  readonly #details = new Map<string, readonly LayerFeature[]>();
  readonly #heldIdentifies = new Map<string, Promise<void>>();
  #held: Promise<void> | null = null;

  /** Makes `load` for a layer return these features. */
  setFeatures(layerId: string, features: readonly LayerFeature[]): void {
    this.#outcomes.set(layerId, { kind: "features", features });
  }

  /** Makes `load` for a layer reject with a `LayerError` of this kind. */
  fail(layerId: string, error: "network" | "invalid"): void {
    this.#outcomes.set(layerId, { kind: "failure", error });
  }

  /** Makes `identify` for a layer find these features. */
  setIdentified(layerId: string, features: readonly LayerFeature[]): void {
    this.#identified.set(layerId, { kind: "features", features });
  }

  /** Makes `identify` for a layer reject with a `LayerError` of this kind. */
  failIdentify(layerId: string, error: "network" | "invalid"): void {
    this.#identified.set(layerId, { kind: "failure", error });
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

  /**
   * Makes every identify of one layer wait until the returned function is
   * called. Other layers' identifies, and every load, are not held.
   */
  holdIdentify(layerId: string): () => void {
    let release!: () => void;
    this.#heldIdentifies.set(
      layerId,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return () => {
      this.#heldIdentifies.delete(layerId);
      release();
    };
  }

  async load(request: LayerLoadRequest): Promise<readonly LayerFeature[]> {
    const { definition, controls, now, signal, area } = request;
    this.requests.push({
      ...request,
      url: feedUrl(definition, controls, now, area),
    });
    await this.#wait(signal, this.#held);
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
    await this.#wait(request.signal, this.#held);
    const shapes = this.#details.get(request.definition.id) ?? [];
    if (shapes.length === 0) {
      throw new LayerError("empty");
    }
    return shapes;
  }

  async identify(
    request: LayerIdentifyRequest,
  ): Promise<readonly LayerFeature[]> {
    const { definition, controls, now, at, signal } = request;
    this.identifyRequests.push({
      ...request,
      url: identifyUrl(definition, controls, now, at),
    });
    await this.#wait(signal, this.#heldIdentifies.get(definition.id) ?? null);
    const outcome = this.#identified.get(definition.id);
    if (outcome?.kind === "failure") {
      throw new LayerError(outcome.error);
    }
    return outcome?.features ?? [];
  }

  async #wait(
    signal: AbortSignal | undefined,
    held: Promise<void> | null,
  ): Promise<void> {
    if (signal?.aborted) {
      throw new LayerError("aborted");
    }
    if (held) {
      await held;
    }
    if (signal?.aborted) {
      throw new LayerError("aborted");
    }
  }
}
