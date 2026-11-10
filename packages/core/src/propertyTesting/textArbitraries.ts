import fc from "fast-check";

/** The longest piece of hostile text a property generates by default. */
const MAX_HOSTILE_LENGTH = 2_000;

/** The most pieces a text built from fragments may have. */
const MAX_FRAGMENTS = 40;

/** The longest piece of random text mixed in between fragments. */
const MAX_FILLER_LENGTH = 8;

/** The most times a fragment is repeated to make a long, hostile run. */
const MAX_REPEATS = 5_000;

/** Any text at all: every UTF-16 code unit, including lone surrogates and controls. */
export const hostileText: fc.Arbitrary<string> = fc.string({
  unit: "binary",
  maxLength: MAX_HOSTILE_LENGTH,
});

/**
 * Text built from the pieces a parser expects, with random filler between
 * them. Plain random text almost never gets past a parser's first check;
 * this reaches the code behind it.
 */
export function textFromFragments(
  fragments: readonly string[],
): fc.Arbitrary<string> {
  return fc
    .array(
      fc.oneof(
        fc.constantFrom(...fragments),
        fc.string({ maxLength: MAX_FILLER_LENGTH }),
      ),
      { maxLength: MAX_FRAGMENTS },
    )
    .map((parts) => parts.join(""));
}

/** One fragment repeated many times, to find work that grows faster than the text. */
export function repeatedFragment(fragment: string): fc.Arbitrary<string> {
  return fc
    .integer({ min: 1, max: MAX_REPEATS })
    .map((count) => fragment.repeat(count));
}
