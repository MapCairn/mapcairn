import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import * as styles from "./SegmentedControl.css";

/** One choice in a {@link SegmentedControl}. */
export interface SegmentedControlOption {
  /** The value reported through `onValueChange` when this item is chosen. */
  readonly value: string;
  /** The visible text, which is also the item's accessible name. */
  readonly label: string;
  /** Optional decorative icon shown before the label. It is hidden from assistive technology. */
  readonly icon?: ReactNode;
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
 * A single-choice control that shows all options at once, built on the Radix
 * ToggleGroup in single mode.
 *
 * Radix renders the group as a `radiogroup` and each item as a `radio`, which
 * is the right semantics for a mutually exclusive choice. Focus moves between
 * items with the arrow keys (one tab stop for the whole group) and Space or
 * Enter chooses the focused item.
 *
 * Unlike a raw toggle group, the selection can never be cleared: pressing the
 * active item again is ignored. The selected item is filled and shows a check
 * mark, so selection never relies on colour alone.
 */
export function SegmentedControl({
  label,
  options,
  value,
  onValueChange,
  disabled = false,
  className,
  "data-testid": testId,
}: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      className={className ? `${styles.group} ${className}` : styles.group}
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) {
          onValueChange(next);
        }
      }}
      data-testid={testId}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          className={styles.item}
          value={option.value}
          data-testid={testId ? `${testId}-${option.value}` : undefined}
        >
          {option.icon ? (
            <span className={styles.icon} aria-hidden="true">
              {option.icon}
            </span>
          ) : null}
          {option.label}
          {option.value === value ? (
            <Check aria-hidden="true" className={styles.check} />
          ) : null}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
