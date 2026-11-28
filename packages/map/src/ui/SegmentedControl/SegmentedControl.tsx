// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useReadingDirection } from "@mapcairn/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePrivateElements } from "../../lit/usePrivateElements";
import * as styles from "./SegmentedControl.css";
import type { SegmentedControlElement } from "./SegmentedControlElement";
import { useIconNodes } from "./useIconNodes";

/** One choice in a {@link SegmentedControl}. */
export interface SegmentedControlOption {
  /** The value reported through `onValueChange` when this item is chosen. */
  readonly value: string;
  /** The visible text, which is also the item's accessible name. */
  readonly label: string;
  /** Optional decorative icon shown before the label. It is hidden from assistive technology. */
  readonly icon?: ReactNode;
  /**
   * The BCP 47 language the label is written in, when it differs from the
   * page's, so assistive technology reads it in that language.
   */
  readonly lang?: string;
}

/** Props for {@link SegmentedControl}. */
export interface SegmentedControlProps {
  /** Accessible name of the group, for example "Theme". Required. */
  readonly label: string;
  /** The choices, in display order. */
  readonly options: readonly SegmentedControlOption[];
  /** The selected value. The component is controlled and always has a selection. */
  readonly value: string;
  /** Called with the new value when the user picks a different item. */
  readonly onValueChange: (value: string) => void;
  /** Stops every item from being chosen and dims the group. */
  readonly disabled?: boolean;
  /** Applied to the group element. */
  readonly className?: string;
  /** Applied to the group. Each item gets the same id plus `-` and its value. */
  readonly "data-testid"?: string;
}

/**
 * Hands the props to the private element and has it render as React commits, so
 * a parent's effect finds the buttons, as it would with markup of React's own.
 */
function SegmentedControlPart({
  tag,
  label,
  options,
  value,
  onValueChange,
  disabled = false,
  className,
  "data-testid": testId,
}: SegmentedControlProps & { readonly tag: string }) {
  const direction = useReadingDirection();
  const ref = useRef<SegmentedControlElement>(null);
  const icons = useIconNodes(options, styles.icon);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    element.label = label;
    element.options = options.map((option) => ({
      value: option.value,
      label: option.label,
      lang: option.lang,
      icon: icons.get(option.value),
    }));
    element.value = value;
    element.disabled = disabled;
    element.direction = direction;
    element.itemTestId = testId;
    element.choose = onValueChange;
    element.flush();
  });
  // The tag is a name chosen when the element was defined, so it is a variable.
  const Group = tag as "div";
  return (
    <>
      <Group
        ref={ref as React.Ref<HTMLDivElement>}
        className={className ? `${styles.group} ${className}` : styles.group}
        data-testid={testId}
      />
      {options.map((option) => {
        const node = icons.get(option.value);
        return node === undefined
          ? null
          : createPortal(option.icon, node, option.value);
      })}
    </>
  );
}

/**
 * A single-choice control that shows all options at once, drawn by a private
 * Lit element.
 *
 * The group is a `radiogroup` and each item a `radio`, which is the right
 * semantics for a mutually exclusive choice. Focus moves between items with the
 * arrow keys (one tab stop for the whole group) and Space or Enter chooses the
 * focused item.
 *
 * The selection can never be cleared: pressing the active item again is
 * ignored. The selected item is filled and shows a check mark, so selection
 * never relies on colour alone.
 *
 * @remarks It draws only in a browser: a server's markup holds nothing for it,
 *   and the first one on a page appears once its element has loaded.
 */
// Destructured so the API report keeps naming the parameter `input`.
export function SegmentedControl({ ...props }: SegmentedControlProps) {
  const elements = usePrivateElements();
  return (
    <>
      {elements.status === "ready" ? (
        <SegmentedControlPart {...props} tag={elements.value.segmented} />
      ) : null}
    </>
  );
}
