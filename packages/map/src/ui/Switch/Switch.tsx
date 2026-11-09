import * as RadixSwitch from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import { useId } from "react";
import * as styles from "./Switch.css";

/** Props for {@link Switch}. */
export interface SwitchProps {
  /** The visible label. Required: a switch is never unnamed or named only by an icon. */
  readonly label: string;
  /** Optional supporting text, announced as the control's description. */
  readonly description?: string;
  /** Whether the switch is on. The component is controlled. */
  readonly checked: boolean;
  /** Called with the next state when the user toggles the switch. */
  readonly onCheckedChange: (checked: boolean) => void;
  /** Stops the switch from being toggled and dims it. */
  readonly disabled?: boolean;
  /** Applied to the row element. */
  readonly className?: string;
  /** Applied to the control. The row gets the same id with a `-row` suffix. */
  readonly "data-testid"?: string;
}

/**
 * A labelled on/off switch built on the Radix Switch primitive. The label is a
 * real `label` element tied to the control, so clicking the text toggles it,
 * and the optional description is exposed through `aria-describedby`.
 *
 * The on state is shown three ways: the thumb slides, the track fills with the
 * accent, and the thumb carries a tick, so it never relies on colour alone.
 * The row is at least 48px tall.
 */
export function Switch({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  className,
  "data-testid": testId,
}: SwitchProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div
      className={className ? `${styles.row} ${className}` : styles.row}
      data-disabled={disabled}
      data-testid={testId ? `${testId}-row` : undefined}
    >
      <div className={styles.text}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        {description ? (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        ) : null}
      </div>
      <RadixSwitch.Root
        id={id}
        className={styles.track}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
      >
        <RadixSwitch.Thumb className={styles.thumb}>
          {checked ? (
            <Check aria-hidden="true" className={styles.tick} />
          ) : null}
        </RadixSwitch.Thumb>
      </RadixSwitch.Root>
    </div>
  );
}
