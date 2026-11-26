// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFormatterRegistry,
  createRuntimeLayerCatalogue,
  createStaticLayerCatalogue,
  emptyLayerCatalogue,
  isIdentifiable,
  type LayerCatalogue,
  type LayerDefinition,
  type LayerSource,
  loadsFeatures,
  type SkippedDefinition,
} from "@mapcairn/core";
import { MountMapError } from "./MountMapError";

/** What {@link buildLayers} needs from the mount. */
export interface LayersInput {
  /** The page's layer source, when it wrote one. */
  readonly layerSource: LayerSource | undefined;
  /** Hands the mount a problem found after the map is drawing. */
  readonly report: (error: MountMapError) => void;
}

/** What {@link buildLayers} makes from the `layers` option. */
export interface BuiltLayers {
  /** The catalogue the interface reads, empty when the page gave no layers. */
  readonly catalogue: LayerCatalogue;
  /** Whether the page gave layers, which only the layers tool can turn on. */
  readonly present: boolean;
  /** Stops what the catalogue and the checks on it started. */
  readonly dispose: () => void;
}

function invalid(message: string): never {
  throw new MountMapError("invalid-option", message);
}

/** Whether a layer asks the layer source for its features or for what a tap found. */
function needsLayerSource(definition: LayerDefinition): boolean {
  return loadsFeatures(definition) || isIdentifiable(definition);
}

function registries() {
  return {
    decoders: createDecoderRegistry(),
    formatters: createFormatterRegistry(),
  };
}

function missingSource(
  definitions: readonly LayerDefinition[],
  layerSource: LayerSource | undefined,
): readonly LayerDefinition[] {
  return layerSource === undefined ? definitions.filter(needsLayerSource) : [];
}

function buildStatic(
  definitions: readonly LayerDefinition[],
  layerSource: LayerSource | undefined,
): BuiltLayers {
  let catalogue: LayerCatalogue;
  try {
    catalogue = createStaticLayerCatalogue(definitions, registries());
  } catch (error) {
    // The static catalogue throws one `Error` that lists every problem.
    return invalid(
      `layers: ${(error as Error).message}\nFix each one, or remove it from layers.`,
    );
  }
  const lacking = missingSource(definitions, layerSource);
  if (lacking.length > 0) {
    const ids = lacking.map(({ id }) => id).join(", ");
    invalid(
      `layers: ${ids} need services.layerSource to load their features. Pass services.layerSource, or remove them from layers.`,
    );
  }
  return { catalogue, present: true, dispose: () => {} };
}

function skippedMessage({ id, problems }: SkippedDefinition): MountMapError {
  const name = id === undefined || id === "" ? "(no id)" : id;
  return new MountMapError(
    "invalid-option",
    `layers: "${name}" was left out because it is not valid: ${problems.join("; ")}. Fix the definition.`,
  );
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** The message for a loaded layer that is left out because it needs a layer source the page did not give. */
function lackingSourceMessage(id: string): MountMapError {
  return new MountMapError(
    "invalid-option",
    `layers: "${id}" was left out because it needs services.layerSource to load its features. Pass services.layerSource, or remove it from layers.`,
  );
}

/**
 * What a loader returned, less the layers that need a layer source when the
 * page gave none. Each is reported and never reaches the catalogue, so it is
 * not shown only to fail as empty. A payload that is not a list is the
 * catalogue's to judge.
 */
function withoutLacking(
  payload: unknown,
  { layerSource, report }: LayersInput,
): unknown {
  if (!Array.isArray(payload) || layerSource !== undefined) {
    return payload;
  }
  return payload.filter((entry) => {
    // An entry with no source is the catalogue's to skip as not valid.
    const candidate = entry as LayerDefinition;
    if (!isObject(entry) || !isObject(candidate.source)) {
      return true;
    }
    if (!needsLayerSource(candidate)) {
      return true;
    }
    report(lackingSourceMessage(String((entry as LayerDefinition).id)));
    return false;
  });
}

/** Runs the page's function, reporting a failure before the catalogue shows it as one. */
async function loaded(
  load: () => Promise<readonly LayerDefinition[]>,
  { report }: LayersInput,
): Promise<readonly LayerDefinition[]> {
  try {
    return await load();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    report(
      new MountMapError(
        "layers-unavailable",
        `layers: the function could not load the layers (${reason}). Fix it, or pass the definitions as a list.`,
      ),
    );
    throw error;
  }
}

function buildRuntime(
  load: () => Promise<readonly LayerDefinition[]>,
  input: LayersInput,
): BuiltLayers {
  const catalogue = createRuntimeLayerCatalogue({
    load: async () => withoutLacking(await loaded(load, input), input),
    options: registries(),
    onSkipped: (skipped) => {
      for (const entry of skipped) {
        input.report(skippedMessage(entry));
      }
    },
  });
  return { catalogue, present: true, dispose: () => catalogue.dispose() };
}

/**
 * Builds the layer catalogue from the `layers` option: a list goes through
 * the static catalogue, which refuses an invalid definition at once, and a
 * function through the runtime one, which leaves out what is wrong and says
 * so through `report`.
 *
 * @throws MountMapError for a list that is not usable or that needs a layer
 *   source the page did not give.
 */
export function buildLayers(layers: unknown, input: LayersInput): BuiltLayers {
  if (layers === undefined) {
    return {
      catalogue: emptyLayerCatalogue,
      present: false,
      dispose: () => {},
    };
  }
  if (typeof layers === "function") {
    return buildRuntime(
      layers as () => Promise<readonly LayerDefinition[]>,
      input,
    );
  }
  if (!Array.isArray(layers)) {
    invalid(
      "layers must be a list of layer definitions, or a function that returns one.",
    );
  }
  return buildStatic(layers as readonly LayerDefinition[], input.layerSource);
}
