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
  readyLayers,
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

function buildRuntime(
  load: () => Promise<readonly LayerDefinition[]>,
  { layerSource, report }: LayersInput,
): BuiltLayers {
  const catalogue = createRuntimeLayerCatalogue({
    load: () => load(),
    options: registries(),
    onSkipped: (skipped) => {
      for (const entry of skipped) {
        report(skippedMessage(entry));
      }
    },
  });
  const reported = new Set<string>();
  const stopWatching = catalogue.subscribe(() => {
    for (const { id } of missingSource(
      readyLayers(catalogue.getState()),
      layerSource,
    )) {
      if (!reported.has(id)) {
        reported.add(id);
        report(
          new MountMapError(
            "invalid-option",
            `layers: ${id} needs services.layerSource to load its features. Pass services.layerSource, or remove it from layers.`,
          ),
        );
      }
    }
  });
  return {
    catalogue,
    present: true,
    dispose: () => {
      stopWatching();
      catalogue.dispose();
    },
  };
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
