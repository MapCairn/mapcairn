// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";
import { usePreferences } from "../../services";
import * as styles from "./Tooltip.css";

/** Gap between the trigger and the tooltip, in pixels, taken from the spacing scale. */
const SIDE_OFFSET = Number.parseInt(tokenValues.space.xs, 10);

/** Props for {@link TooltipProvider}. */
export interface TooltipProviderProps {
  /** Milliseconds a hover must last before the first tooltip opens. Defaults to 400. */
  readonly delayDuration?: number;
  /**
   * Milliseconds after a tooltip closes during which the next one opens
   * with no delay, so sweeping across a control group feels continuous.
   * Defaults to 300.
   */
  readonly skipDelayDuration?: number;
  readonly children: ReactNode;
}

/**
 * Shares the open delay between every {@link Tooltip} below it. The app mounts
 * it once at the root. A {@link Tooltip} outside a provider throws.
 */
export function TooltipProvider({
  delayDuration = 400,
  skipDelayDuration = 300,
  children,
}: TooltipProviderProps) {
  return (
    <RadixTooltip.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent={false}
    >
      {children}
    </RadixTooltip.Provider>
  );
}

/** Props for {@link Tooltip}. */
export interface TooltipProps {
  /** The tooltip text. Keep it short and never put the only copy of important information here. */
  readonly content: ReactNode;
  /**
   * The one focusable element the tooltip belongs to, such as a button. It
   * must forward its ref and spread extra props onto a DOM element.
   */
  readonly children: ReactElement;
}

/**
 * A short hint attached to a focusable control, built on the Radix Tooltip.
 *
 * A tooltip supplements an accessible name and never replaces one: the
 * trigger must already be named by its own text or `aria-label`, and the
 * tooltip is exposed as its description.
 *
 * It opens on keyboard focus as well as hover, closes with Escape, and stays
 * open while the pointer is over the tooltip itself (WCAG 1.4.13). Touch
 * devices cannot hover, so when the device preferences report no fine
 * pointer the tooltip does not exist at all and only the trigger renders.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const { finePointer } = usePreferences();
  if (!finePointer) {
    return children;
  }
  return (
    <RadixTooltip.Root disableHoverableContent={false}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className={styles.content}
          sideOffset={SIDE_OFFSET}
          collisionPadding={SIDE_OFFSET}
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
