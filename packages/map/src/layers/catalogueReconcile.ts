// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type CatalogueChange,
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
}

/** What {@link reconcile} reads. */
export interface ReconcileInputs {
  readonly chosen: Chosen;
  readonly link: Link;
  /** The list the choices were last reconciled with: none before the first one. */
  readonly known: readonly LayerDefinition[];
  /** The list the catalogue holds now. */
  readonly next: readonly LayerDefinition[];
  /** Whether a link layer that is not in the list is to be counted, so it can be said. */
  readonly noteLink: boolean;
  /** The clock, in epoch milliseconds, for relative control defaults. */
  readonly now: number;
}

/** What {@link reconcile} works out. */
export interface Reconciled {
  readonly chosen: Chosen;
  /** The link once answered: nothing waits any longer, so a dropped id stays dropped. */
  readonly link: Link;
  /** The ids of enabled layers the list no longer holds, which are now off. */
  readonly turnedOff: readonly string[];
  /** What to say about it: the names turned off, and how many link layers were not there. */
  readonly change: CatalogueChange;
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
  const { chosen, link, known, next, noteLink } = inputs;
  const inList = new Set(next.map((definition) => definition.id));
  const names = new Map(
    known.map((definition) => [definition.id, definition.name]),
  );
  const turnedOff = chosen.enabled.filter((id) => !inList.has(id));
  const stillOn = chosen.enabled.filter((id) => inList.has(id));
  const arrived = link.waiting.filter(
    (id) => inList.has(id) && !stillOn.includes(id),
  );
  const missing = link.waiting.filter((id) => !inList.has(id));
  return {
    chosen: {
      enabled: [...stillOn, ...arrived],
      controls: controlsOf(inputs),
    },
    link: { waiting: [], controls: {} },
    turnedOff,
    change: {
      turnedOff: turnedOff.map((id) => names.get(id) ?? id),
      linkUnavailable: noteLink ? missing.length : 0,
    },
  };
}
