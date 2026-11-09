import * as RadixSlider from "@radix-ui/react-slider";
import { type CSSProperties, useId } from "react";
import * as styles from "./Slider.css";

/** Props for {@link Slider}. */
export interface SliderProps {
  /** The visible label. Required: the slider is named by it. */
  readonly label: string;
  /** Lowest value. */
  readonly min: number;
  /** Highest value. */
  readonly max: number;
  /** Distance between allowed values. Arrow keys move by one step. */
  readonly step: number;
  /** The current value. The component is controlled. */
  readonly value: number;
  /** Called with the next value as the user drags or presses keys. */
  readonly onValueChange: (value: number) => void;
  /**
   * Turns a value into the text shown beside the label and announced as the
   * slider's aria-valuetext. For example, a percentage slider returns "60%"
   * for 60.
   */
  readonly formatValue: (value: number) => string;
  /** Stops the slider from changing and dims it. */
  readonly disabled?: boolean;
  /** Applied to the outer wrapper. */
  readonly className?: string;
  /**
   * Applied to the outer wrapper. The value readout gets the same id with a
   * `-value` suffix and the track a `-track` suffix.
   */
  readonly "data-testid"?: string;
}

/** The filled share of the track as a percentage, kept within 0 to 100. */
function fillPercent(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }
  const share = ((value - min) / (max - min)) * 100;
  return Math.min(100, Math.max(0, share));
}

/**
 * A single-thumb slider built on the Radix Slider primitive, with a visible
 * label and a visible value readout.
 *
 * Radix provides the keyboard model (arrows, Home, End, PageUp and PageDown).
 * The thumb is a 24px circle inside a 44px hit area. The value text is also
 * exposed as `aria-valuetext`, so assistive technology hears the formatted
 * value rather than the raw number.
 */
export function Slider({
  label,
  min,
  max,
  step,
  value,
  onValueChange,
  formatValue,
  disabled = false,
  className,
  "data-testid": testId,
}: SliderProps) {
  const labelId = useId();
  const text = formatValue(value);
  const fill = `${fillPercent(value, min, max)}%`;
  return (
    <div
      className={className ? `${styles.root} ${className}` : styles.root}
      data-testid={testId}
    >
      <div className={styles.header}>
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        <span
          className={styles.value}
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {text}
        </span>
      </div>
      <RadixSlider.Root
        className={styles.control}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => {
          const [first] = next;
          if (first !== undefined) {
            onValueChange(first);
          }
        }}
      >
        <RadixSlider.Track
          className={styles.track}
          style={{ "--slider-fill": fill } as CSSProperties}
          data-testid={testId ? `${testId}-track` : undefined}
        />
        <RadixSlider.Thumb
          className={styles.thumb}
          aria-labelledby={labelId}
          aria-valuetext={text}
        >
          <span className={styles.thumbVisual} />
        </RadixSlider.Thumb>
      </RadixSlider.Root>
    </div>
  );
}
