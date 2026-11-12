/**
 * Limits `value` to the range `[min, max]`. Internal to core, so the package
 * does not grow a general maths export.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
