/**
 * Resolves a themed CSS colour: `darkColor` when `dark` is `true` and set,
 * otherwise `color`.
 * @remarks Gives every consumer of a layer's `color`/`darkColor` pairs (bucket
 *   fills, legend swatches, line casings) one light and dark fallback rule, so
 *   a rendered colour and its legend swatch always agree.
 */
export function resolveThemedColor(
  color: string,
  darkColor: string | undefined,
  dark: boolean,
): string {
  return (dark && darkColor) || color;
}
