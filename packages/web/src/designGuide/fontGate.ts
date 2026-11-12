// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";

/**
 * Text measured to tell IBM Plex Sans from its fallback. The fallback is
 * matched to Plex by average width, so ordinary prose measures almost the
 * same; runs of narrow and wide glyphs and figures do not.
 */
export const FONT_PROBE_TEXT = "iiiiilllll WWWWWMMMMM 0123456789";

/** Size the probe is measured at, so a small per-glyph difference adds up. */
const PROBE_SIZE = "48px";

/**
 * The smallest width difference, in CSS pixels at {@link PROBE_SIZE}, that
 * counts as Plex rendering rather than the fallback.
 */
export const MIN_WIDTH_DIFFERENCE_PX = 4;

/**
 * The first two families of the token font stack: the self-hosted face and
 * its metric-matched fallback, quoted as CSS writes them.
 */
export function fontFamilies(): { primary: string; fallback: string } {
  const [primary = "", fallback = ""] = tokenValues.fontFamily
    .split(",")
    .map((family) => family.trim());
  return { primary, fallback };
}

/** What {@link checkFontGate} needs from the browser, injected so it can be tested. */
export interface FontGateDeps {
  /** `document.fonts`. Only the settling of `ready` is used, not its value. */
  readonly fonts: Pick<FontFaceSet, "load" | "check"> & {
    readonly ready: PromiseLike<unknown>;
  };
  /** Width of `text` in `font` (CSS font shorthand), or undefined when it cannot be measured. */
  readonly measure: (font: string, text: string) => number | undefined;
}

/** The outcome of {@link checkFontGate}. */
export interface FontGateResult {
  readonly loaded: boolean;
  /** Why the check failed, for the page and the test report. Empty on success. */
  readonly reason: string;
}

/**
 * Proves IBM Plex Sans is the font actually rendering. Both weights the type
 * scale uses must load and pass `document.fonts.check`, and the probe text
 * must measure differently from the same text in the fallback face alone.
 *
 * @remarks `check` on its own is not enough: it also returns true when no
 *   face matches at all. The width comparison catches a font that was never
 *   requested or failed to download, because the stack then falls through to
 *   the fallback and both measurements agree.
 */
export async function checkFontGate(
  deps: FontGateDeps,
): Promise<FontGateResult> {
  const { primary, fallback } = fontFamilies();
  const weights = Object.values(tokenValues.fontWeight);
  // The fallback is a local() face, which the canvas only uses once loaded.
  const requests = [
    ...weights.map((weight) => `${weight} ${PROBE_SIZE} ${primary}`),
    `${tokenValues.fontWeight.regular} ${PROBE_SIZE} ${fallback}`,
  ];
  await Promise.all(
    requests.map((font) => deps.fonts.load(font).catch(() => [])),
  );
  await deps.fonts.ready;
  const notLoaded = weights.filter(
    (weight) => !deps.fonts.check(`${weight} ${PROBE_SIZE} ${primary}`),
  );
  if (notLoaded.length > 0) {
    return {
      loaded: false,
      reason: `Weight ${notLoaded.join(" and ")} is not loaded.`,
    };
  }
  const regular = tokenValues.fontWeight.regular;
  const withPlex = deps.measure(
    `${regular} ${PROBE_SIZE} ${primary}, ${fallback}`,
    FONT_PROBE_TEXT,
  );
  const fallbackOnly = deps.measure(
    `${regular} ${PROBE_SIZE} ${fallback}`,
    FONT_PROBE_TEXT,
  );
  if (
    withPlex === undefined ||
    fallbackOnly === undefined ||
    Math.abs(withPlex - fallbackOnly) < MIN_WIDTH_DIFFERENCE_PX
  ) {
    return {
      loaded: false,
      reason: "Text measures the same as the fallback face.",
    };
  }
  return { loaded: true, reason: "" };
}
