// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ControlValues,
  type LayerDefinition,
  resolveControlValues,
} from "@mapcairn/core";

/** Control values by layer id. */
export type ControlsById = Readonly<Record<string, ControlValues>>;

/** What the person has chosen: which layers are on, and every listed layer's control values. */
export interface Chosen {
  readonly enabled: readonly string[];
  readonly controls: ControlsById;
}

/**
 * The layers a link named that no list has answered for yet, with the
 * link's own control values for them, as written and not yet resolved.
 */
export interface Link {
  readonly waiting: readonly string[];
  readonly controls: ControlsById;
  /**
   * How many ids the link carried past its limit on layers (see
   * `LayersUrlState.dropped`), none when absent. They were never kept, so they
   * only add to the count of layers the link named that the list lacks.
   */
  readonly dropped?: number;
}

/** What {@link reconcile} reads. */
export interface ReconcileInputs {
  readonly chosen: Chosen;
  readonly link: Link;
  /** The list the choices were last reconciled with: none before the first one. */
  readonly known: readonly LayerDefinition[];
  /** The list the catalogue holds now. */
  readonly next: readonly LayerDefinition[];
  /** The clock, in epoch milliseconds, for relative control defaults. */
  readonly now: number;
}

/** An enabled layer that left the list, by id and by the name it had. */
export interface SwitchedOff {
  readonly id: string;
  readonly name: string;
}

/**
 * What {@link reconcile} works out. How many definitions were skipped is not
 * here: it is in the catalogue's own state (`skipped`).
 */
export interface Reconciled {
  readonly chosen: Chosen;
  /** The link once answered: nothing waits any longer, so a dropped id stays dropped. */
  readonly link: Link;
  /** The ids the list has that the last one did not. */
  readonly added: readonly string[];
  /** The ids the last list had that this one does not, whether the layer was on or off. */
  readonly removed: readonly string[];
  /** The enabled layers among those removed, which are now off. */
  readonly switchedOff: readonly SwitchedOff[];
  /** How many layers the link named that the list does not have, with those it carried past its limit. */
  readonly linkMissing: number;
}

/**
 * The control values of every layer in the new list. A layer that arrives
 * gets its defaults, or the link's values when the link named it. A layer
 * whose definition changed keeps the values that are still valid and takes
 * the default for the rest. A layer whose definition is the same object keeps
 * its values as they are, so a refresh that changes nothing changes nothing.
 */
function controlsOf(inputs: ReconcileInputs): ControlsById {
  const { chosen, link, known, next, now } = inputs;
  const before = new Map(
    known.map((definition) => [definition.id, definition]),
  );
  return Object.fromEntries(
    next.map((definition) => {
      const { id } = definition;
      const current = chosen.controls[id];
      if (current && before.get(id) === definition) {
        return [id, current];
      }
      const given =
        current ?? (link.waiting.includes(id) ? link.controls[id] : undefined);
      return [id, resolveControlValues(definition, given, now)];
    }),
  );
}

/**
 * Brings the person's choices in line with a new list of layers: a link layer
 * that was waiting is turned on if the list has it and dropped if not, a layer
 * that arrives gets its controls, a layer that is on and has gone is turned
 * off, and a layer that changed keeps what is still valid. Pure: the caller
 * clears what the layers that went had loaded and says the change aloud.
 */
export function reconcile(inputs: ReconcileInputs): Reconciled {
  const { chosen, link, known, next } = inputs;
  const inList = new Set(next.map((definition) => definition.id));
  const wasListed = new Set(known.map((definition) => definition.id));
  const names = new Map(
    known.map((definition) => [definition.id, definition.name]),
  );
  const stillOn = chosen.enabled.filter((id) => inList.has(id));
  const arrived = link.waiting.filter(
    (id) => inList.has(id) && !stillOn.includes(id),
  );
  return {
    chosen: {
      enabled: [...stillOn, ...arrived],
      controls: controlsOf(inputs),
    },
    link: { waiting: [], controls: {} },
    added: next.map(({ id }) => id).filter((id) => !wasListed.has(id)),
    removed: known.map(({ id }) => id).filter((id) => !inList.has(id)),
    switchedOff: chosen.enabled
      .filter((id) => !inList.has(id))
      .map((id) => ({ id, name: names.get(id) ?? id })),
    linkMissing:
      link.waiting.filter((id) => !inList.has(id)).length + (link.dropped ?? 0),
  };
}
