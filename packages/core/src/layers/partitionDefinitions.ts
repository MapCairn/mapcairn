// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SkippedDefinition } from "../ports/layers";
import type { LayerDefinition } from "./definition";
import { jsonEqual } from "./jsonEqual";
import { type ValidationOptions, validateLayerDefinition } from "./validate";

/** The valid definitions in a list, and what was wrong with the others. */
export interface PartitionedDefinitions {
  readonly layers: readonly LayerDefinition[];
  readonly skipped: readonly SkippedDefinition[];
}

const NOTHING: PartitionedDefinitions = Object.freeze({
  layers: Object.freeze([]),
  skipped: Object.freeze([]),
});

const DUPLICATE_ID_PROBLEM = "id: duplicate";

const UNREADABLE: SkippedDefinition = Object.freeze({
  problems: Object.freeze(["definition: could not be read"]),
});

function textId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { id } = value as { id?: unknown };
  return typeof id === "string" ? id : undefined;
}

function skippedFor(
  value: unknown,
  problems: readonly string[],
): SkippedDefinition {
  const id = textId(value);
  return id === undefined ? { problems } : { id, problems };
}

function sameObjects<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * Sorts a list of values a host supplied into valid layer definitions and
 * the values that were not, so one bad definition costs one layer and not
 * the list. Whatever an entry holds, even a value that throws when read, it
 * does not throw: every entry is validated by `validateLayerDefinition`, and
 * an entry that fails is returned as a {@link SkippedDefinition} with its
 * problems and, when it had a text `id`, that id. (`raw` itself must be a
 * readable array: the runtime catalogue checks that.)
 *
 * - A definition whose id a definition already kept has is skipped with the
 *   problem `id: duplicate`: the first valid one wins.
 * - A value that is not an object is skipped with no id.
 * - A value that cannot be read at all is skipped with the problem
 *   `definition: could not be read`.
 * - Given the `previous` result, a definition that is deeply equal to the
 *   previous one with the same id keeps the previous object, and the whole
 *   `layers` (or `skipped`) list is the previous one when nothing in it
 *   changed, so a refresh that changes nothing changes no reference. A
 *   definition nested more deeply than `jsonEqual` follows counts as
 *   changed.
 */
export function partitionDefinitions(
  raw: readonly unknown[],
  options: ValidationOptions,
  previous: PartitionedDefinitions = NOTHING,
): PartitionedDefinitions {
  const earlier = new Map(previous.layers.map((layer) => [layer.id, layer]));
  const kept = new Set<string>();
  const layers: LayerDefinition[] = [];
  const skipped: SkippedDefinition[] = [];

  function sort(value: unknown): void {
    const problems = validateLayerDefinition(value, options);
    if (problems.length > 0) {
      skipped.push(skippedFor(value, problems));
      return;
    }
    const definition = value as LayerDefinition;
    if (kept.has(definition.id)) {
      skipped.push({ id: definition.id, problems: [DUPLICATE_ID_PROBLEM] });
      return;
    }
    const old = earlier.get(definition.id);
    const layer =
      old !== undefined && jsonEqual(old, definition) ? old : definition;
    kept.add(definition.id);
    layers.push(layer);
  }

  for (const value of raw) {
    try {
      sort(value);
    } catch {
      skipped.push(UNREADABLE);
    }
  }
  return {
    layers: sameObjects(layers, previous.layers)
      ? previous.layers
      : Object.freeze(layers),
    skipped: jsonEqual(skipped, previous.skipped)
      ? previous.skipped
      : Object.freeze(skipped),
  };
}
