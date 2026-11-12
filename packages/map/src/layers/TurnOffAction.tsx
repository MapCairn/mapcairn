// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { pluralise } from "@mapcairn/core";
import { type FocusEvent, useEffect, useRef } from "react";
import { Button } from "../ui/Button";
import * as styles from "./Layers.css";
import type { DataLayers } from "./useDataLayers";

/** Props for {@link TurnOffAction}. */
export interface TurnOffActionProps {
  readonly layers: DataLayers;
  /** The group this action covers, or null for every layer. */
  readonly group: string | null;
  /** The layers it would turn off: those in its scope that are on. */
  readonly ids: readonly string[];
}

/**
 * Keeps focus from falling to the page when the button or the Undo that has it
 * is replaced by the other. Focus follows only if it was inside the row and
 * nothing else has taken it since, so a person who moved on is left alone.
 */
function useFocusHandoff(showsUndo: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the swap between the button and Undo is the trigger.
  useEffect(() => {
    if (!hadFocus.current) {
      return;
    }
    hadFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) {
      return;
    }
    root.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [showsUndo]);
  return {
    root,
    onFocus: () => {
      hadFocus.current = true;
    },
    // A blur that names where focus went is a person moving on; one that does
    // not is the focused button leaving the page, which the handoff follows.
    onBlur: (event: FocusEvent) => {
      if (event.relatedTarget !== null) {
        hadFocus.current = false;
      }
    },
  };
}

/** What the status says: how many layers went, and for a group, which group. */
function turnedOffText(count: number, group: string | null): string {
  return group === null
    ? `Turned off ${count} ${pluralise(count, ["layer", "layers"])}.`
    : `Turned off ${count} in ${group}.`;
}

interface UndoStatusProps {
  readonly layers: DataLayers;
  readonly text: string;
}

/**
 * What the action says once it has run, with Undo. The countdown to its expiry
 * waits while the pointer is over it or focus is inside it, and is released
 * again when it goes.
 */
function UndoStatus({ layers, text }: UndoStatusProps) {
  const { holdUndo, releaseUndo, undoTurnOff } = layers;
  useEffect(() => () => releaseUndo(), [releaseUndo]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only pause a countdown; the one control inside, Undo, is a real button.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the handlers only pause a countdown; the one control inside, Undo, is a real button.
    <div
      className={styles.undoStatus}
      onMouseEnter={holdUndo}
      onMouseLeave={releaseUndo}
      onFocus={holdUndo}
      onBlur={releaseUndo}
    >
      {text}
      <Button variant="quiet" onClick={undoTurnOff}>
        Undo
      </Button>
    </div>
  );
}

/**
 * One action that turns off the layers in its scope, which is every layer or
 * one group's. Once it has run, the same place says how many went and offers
 * Undo, until the offer expires or another batch replaces it. The status is
 * plain text: the action is announced once, by the hook, through the shared
 * live region. The action for every layer is disabled, not hidden, when none
 * is on; a group's is left out then.
 */
export function TurnOffAction({ layers, group, ids }: TurnOffActionProps) {
  const { turnedOff } = layers;
  const showsUndo = turnedOff !== null && turnedOff.group === group;
  const handoff = useFocusHandoff(showsUndo);
  if (!showsUndo && group !== null && ids.length === 0) {
    return null;
  }
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only watch where focus is; the controls inside are real buttons.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the handlers only watch where focus is; the controls inside are real buttons.
    <div
      ref={handoff.root}
      className={styles.turnOffRow}
      data-testid={group === null ? "turn-off-all" : "turn-off-group"}
      onFocus={handoff.onFocus}
      onBlur={handoff.onBlur}
    >
      {showsUndo ? (
        <UndoStatus
          layers={layers}
          text={turnedOffText(turnedOff.count, group)}
        />
      ) : (
        <TurnOffButton layers={layers} group={group} ids={ids} />
      )}
    </div>
  );
}

/** The button of an action that has not run: "Turn off all layers" with its count, or a group's. */
function TurnOffButton({ layers, group, ids }: TurnOffActionProps) {
  if (group === null) {
    return (
      <Button
        variant="secondary"
        disabled={ids.length === 0}
        onClick={() => layers.turnOff(ids)}
      >
        Turn off all layers
        <span className={styles.turnOffCount}>{ids.length} on</span>
      </Button>
    );
  }
  return (
    <Button
      variant="quiet"
      className={styles.groupTurnOff}
      onClick={() => layers.turnOff(ids, { group })}
    >
      Turn off {ids.length} in {group}
    </Button>
  );
}
