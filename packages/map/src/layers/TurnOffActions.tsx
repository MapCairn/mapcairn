// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { pluralise } from "@mapcairn/core";
import {
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { Button } from "../ui/Button";
import * as styles from "./Layers.css";
import type { DataLayers } from "./useDataLayers";

/** Props for {@link TurnOffAll}. */
export interface TurnOffAllProps {
  readonly layers: DataLayers;
  /** The layers it would turn off: every layer that is on. */
  readonly ids: readonly string[];
}

/** Props for {@link TurnOffGroup}. */
export interface TurnOffGroupProps {
  readonly layers: DataLayers;
  /** The group this action covers. */
  readonly group: string;
  /** The layers it would turn off: those of the group that are on. */
  readonly ids: readonly string[];
}

/** What a Turn off action says once it has run, and how Undo is named. */
interface UndoCopy {
  readonly text: string;
  readonly label: string;
}

/** The words for a batch of `count` layers, such as "3 layers". */
function layerCount(count: number): string {
  return `${count} ${pluralise(count, ["layer", "layers"])}`;
}

/**
 * Keeps focus from falling to the page when the button or the Undo that has it
 * leaves. Focus follows to the first button in the row only if it was inside
 * the row and nothing else has taken it since, so a person who moved on is
 * left alone.
 */
function useFocusHandoff(showsUndo: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the Undo appearing or going is the trigger.
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

interface UndoStatusProps extends UndoCopy {
  readonly layers: DataLayers;
}

/**
 * What the action says once it has run, with Undo. The countdown to its expiry
 * waits while a mouse is over it and while focus is inside it, each held and
 * released on its own, and both are let go when it goes. A tap is not a hover:
 * a touch screen reports one as the pointer entering, and nothing then reports
 * it leaving.
 */
function UndoStatus({ layers, text, label }: UndoStatusProps) {
  const { holdUndo, releaseUndo, undoTurnOff } = layers;
  useEffect(
    () => () => {
      releaseUndo("pointer");
      releaseUndo("focus");
    },
    [releaseUndo],
  );
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      holdUndo("pointer");
    }
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      releaseUndo("pointer");
    }
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only pause a countdown; the one control inside, Undo, is a real button.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the handlers only pause a countdown; the one control inside, Undo, is a real button.
    <div
      className={styles.undoStatus}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onFocus={() => holdUndo("focus")}
      onBlur={() => releaseUndo("focus")}
    >
      {text}
      <Button variant="quiet" aria-label={label} onClick={undoTurnOff}>
        Undo
      </Button>
    </div>
  );
}

interface ActionRowProps {
  readonly layers: DataLayers;
  /** What to say, with Undo, or null when this action has not just run. */
  readonly undo: UndoCopy | null;
  readonly className: string;
  /** The action's button, or nothing when it has none to show. */
  readonly children: ReactNode;
}

/** An action's button with, once it has run, its status and Undo after it. */
function ActionRow({ layers, undo, className, children }: ActionRowProps) {
  const handoff = useFocusHandoff(undo !== null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only watch where focus is; the controls inside are real buttons.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the handlers only watch where focus is; the controls inside are real buttons.
    <div
      ref={handoff.root}
      className={className}
      onFocus={handoff.onFocus}
      onBlur={handoff.onBlur}
    >
      {children}
      {undo ? <UndoStatus layers={layers} {...undo} /> : null}
    </div>
  );
}

/**
 * "Turn off all layers", with how many are on. It is disabled, not hidden,
 * when none is, and it stays once it has run: the status and Undo follow it.
 * The status is plain text; the hook announces the action once, through the
 * shared live region.
 */
export function TurnOffAll({ layers, ids }: TurnOffAllProps) {
  const { turnedOff, turnOff } = layers;
  const undo =
    turnedOff?.group === null
      ? {
          text: `Turned off ${layerCount(turnedOff.count)}.`,
          label: `Undo turning off ${layerCount(turnedOff.count)}`,
        }
      : null;
  return (
    <ActionRow layers={layers} undo={undo} className={styles.turnOffRow}>
      <Button
        variant="secondary"
        disabled={ids.length === 0}
        onClick={() => turnOff(ids)}
      >
        Turn off all layers
        <span className={styles.turnOffCount}>{ids.length} on</span>
      </Button>
    </ActionRow>
  );
}

/**
 * "Turn off N in <group>", shown while the group has layers on. Once it has
 * run, its status and Undo take the row under the group's heading.
 */
export function TurnOffGroup({ layers, group, ids }: TurnOffGroupProps) {
  const { turnedOff, turnOff } = layers;
  const undo =
    turnedOff?.group === group
      ? {
          text: `Turned off ${turnedOff.count} in ${group}.`,
          label: `Undo turning off ${turnedOff.count} in ${group}`,
        }
      : null;
  if (undo === null && ids.length === 0) {
    return null;
  }
  return (
    <ActionRow layers={layers} undo={undo} className={styles.groupActions}>
      {ids.length > 0 ? (
        <Button
          variant="quiet"
          className={styles.groupTurnOff}
          onClick={() => turnOff(ids, { group })}
        >
          Turn off {ids.length} in {group}
        </Button>
      ) : null}
    </ActionRow>
  );
}
