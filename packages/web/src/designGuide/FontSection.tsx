import { Icon } from "@karta/map";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import * as styles from "./DesignGuide.css";
import {
  checkFontGate,
  FONT_PROBE_TEXT,
  type FontGateResult,
} from "./fontGate";
import { GuideSection } from "./GuideSection";

/** Measures text with a 2D canvas, which needs no element on the page and no inline style. */
function measureWithCanvas(font: string, text: string): number | undefined {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return undefined;
  }
  context.font = font;
  return context.measureText(text).width;
}

/** Runs the font gate against this document's fonts. Browser only. */
export function checkDocumentFont(): Promise<FontGateResult> {
  if (!("fonts" in document)) {
    return Promise.resolve({
      loaded: false,
      reason: "This browser has no font loading API.",
    });
  }
  return checkFontGate({ fonts: document.fonts, measure: measureWithCanvas });
}

/** Props for {@link FontSection}. */
export interface FontSectionProps {
  /** Runs the check. Tests pass a scripted result. */
  readonly checkFont: () => Promise<FontGateResult>;
}

type GateState = "pending" | "true" | "false";

/**
 * The font specimen and the font gate. The gate's element carries
 * `data-font-loaded` (`pending`, then `true` or `false`), which the e2e
 * suite waits on, and says the result in words.
 */
export function FontSection({ checkFont }: FontSectionProps) {
  const [result, setResult] = useState<FontGateResult | null>(null);

  useEffect(() => {
    let live = true;
    checkFont().then(
      (outcome) => {
        if (live) {
          setResult(outcome);
        }
      },
      () => {
        if (live) {
          setResult({ loaded: false, reason: "The font check failed." });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [checkFont]);

  const state: GateState =
    result === null ? "pending" : result.loaded ? "true" : "false";
  const glyph =
    state === "pending"
      ? LoaderCircle
      : state === "true"
        ? CircleCheck
        : TriangleAlert;
  const message =
    result === null
      ? "Checking which font is rendering"
      : result.loaded
        ? "IBM Plex Sans loaded"
        : `IBM Plex Sans did not load. The page is showing the fallback face. ${result.reason}`;

  return (
    <GuideSection
      id="font"
      title="Font"
      intro="The check loads both weights through the font loading API, confirms them with document.fonts.check, then measures the probe text against the metric-matched fallback. Plex is rendering only if the widths differ."
    >
      <p
        className={`${styles.fontGate} ${state === "false" ? styles.fontGateFailed : ""}`}
        data-testid="font-gate"
        data-font-loaded={state}
      >
        <Icon icon={glyph} spinning={state === "pending"} />
        {message}
      </p>
      <div className={styles.card}>
        <span className={styles.caption}>Probe text, regular</span>
        <p className={`${styles.specimen} ${styles.regular}`}>
          {FONT_PROBE_TEXT}
        </p>
        <span className={styles.caption}>Probe text, semibold</span>
        <p className={`${styles.specimen} ${styles.semibold}`}>
          {FONT_PROBE_TEXT}
        </p>
      </div>
    </GuideSection>
  );
}
