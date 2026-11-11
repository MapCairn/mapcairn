import {
  type DateTimeControlDefinition,
  dateTimeRange,
  describeSlot,
  describeSlotStart,
  resolveSlot,
  slotsOnDay,
} from "@mapcairn/core";
import { useId } from "react";
import { useAnnounce } from "../ui/LiveRegion";
import * as styles from "./Layers.css";

/** Props for {@link DateTimeControl}. */
export interface DateTimeControlProps {
  readonly control: DateTimeControlDefinition;
  /** The current slot, `YYYY-MM-DDtHHMM` in UTC, already resolved against the control. */
  readonly value: string;
  /** The clock's time, which fixes the newest slot on offer. */
  readonly now: number;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly testId: string;
}

/** The day part of a slot, `YYYY-MM-DD`. */
function dayOf(slot: string): string {
  return slot.slice(0, 10);
}

/**
 * A UTC date and a time of day on the control's step: a native date input
 * bounded by the first and newest days, and a native select that lists only
 * the times that exist on the chosen day. Words under them say which slot is
 * shown and which is the newest, both in UTC, and describe both inputs.
 * Changing the day keeps the time of day; a time the new day does not have
 * yet is moved to the nearest one it has, and that move is announced
 * politely, because the inputs alone would not say so.
 */
export function DateTimeControl({
  control,
  value,
  now,
  disabled,
  onChange,
  testId,
}: DateTimeControlProps) {
  const announce = useAnnounce();
  const statusId = useId();
  const descriptionId = useId();
  const describedBy = control.description
    ? `${statusId} ${descriptionId}`
    : statusId;
  const range = dateTimeRange(control, now);
  const day = dayOf(value);
  return (
    <fieldset className={styles.timeField} disabled={disabled}>
      <legend className={styles.timeLegend}>{control.label}</legend>
      <div className={styles.timeInputs}>
        <label className={styles.field}>
          Date (UTC)
          <input
            type="date"
            className={styles.dateInput}
            min={dayOf(range.min)}
            max={dayOf(range.max)}
            value={day}
            aria-describedby={describedBy}
            data-testid={`${testId}-date`}
            onChange={(event) => {
              if (event.target.value === "") {
                return;
              }
              const requested = `${event.target.value}${value.slice(10)}`;
              const resolved = resolveSlot(control, requested, now);
              onChange(requested);
              if (resolved !== undefined && resolved !== requested) {
                announce(
                  `Time moved to ${describeSlotStart(resolved)}, the nearest available.`,
                );
              }
            }}
          />
        </label>
        <label className={styles.field}>
          Time (UTC)
          <select
            className={styles.dateInput}
            value={value}
            aria-describedby={describedBy}
            data-testid={`${testId}-time`}
            onChange={(event) => onChange(event.target.value)}
          >
            {slotsOnDay(control, day, now).map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id={statusId} className={styles.muted}>
        Showing {describeSlot(value, control.stepMinutes)}. Newest available:{" "}
        {describeSlotStart(range.max)}. Later times are not out yet.
      </p>
      {control.description ? (
        <p id={descriptionId} className={styles.muted}>
          {control.description}
        </p>
      ) : null}
    </fieldset>
  );
}
