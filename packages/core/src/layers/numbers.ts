import type { FieldValue } from "../ports/layers";

/** A decoded field as a number, or null when it is missing or not numeric. */
export function toNumber(value: FieldValue | undefined): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isNaN(number) ? null : number;
  }
  return null;
}

/** The last item whose minimum is at or below `value`, or the first. */
export function stepFor<T>(
  items: readonly T[],
  minimum: (item: T) => number,
  value: number | null,
): T {
  let chosen = items[0] as T;
  if (value === null) {
    return chosen;
  }
  for (const item of items) {
    if (minimum(item) <= value) {
      chosen = item;
    }
  }
  return chosen;
}
