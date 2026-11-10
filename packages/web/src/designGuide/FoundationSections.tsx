import { Icon } from "@mapcairn/map";
import { tokenValues } from "@mapcairn/theme";
import { Check, TriangleAlert } from "lucide-react";
import { APP_ICONS } from "./appIcons";
import * as styles from "./DesignGuide.css";
import { GuideSection } from "./GuideSection";
import {
  type ContrastRow,
  colourRoleRows,
  contrastRows,
  formatRatio,
  type PairResult,
} from "./guideData";

const { typeScale, fontWeight, space, inset, radius, themeValues, motion } =
  tokenValues;

/** Converts a rem size to CSS pixels at the default root size, for display. */
function remToPx(rem: string): string {
  return `${Number.parseFloat(rem) * 16}px`;
}

/** A ratio and Pass or Fail, in words and with an icon, never colour alone. */
export function Verdict({ result }: { readonly result: PairResult }) {
  return (
    <span className={styles.result}>
      <span>{formatRatio(result.ratio)}</span>
      <span
        className={`${styles.verdict} ${result.passes ? styles.pass : styles.fail}`}
      >
        <Icon icon={result.passes ? Check : TriangleAlert} />
        {result.passes ? "Pass" : "Fail"}
      </span>
    </span>
  );
}

/** How a role's pair reads on its card: both ratios and the minimum. */
export function pairSummary(pair: ContrastRow): string {
  const verdict = pair.light.passes && pair.dark.passes ? "pass" : "fail";
  return `${pair.label}: ${formatRatio(pair.light.ratio)} light, ${formatRatio(pair.dark.ratio)} dark, needs ${pair.minimum}:1, ${verdict}`;
}

/** Every colour role: light and dark swatches, hex values and its pair. */
export function ColourSection() {
  return (
    <GuideSection
      id="colour"
      title="Colour"
      intro="Components use these roles and never a ramp step. Each card paints the role in light and dark over that theme's map background, so the translucent surfaces show as they do over the map."
    >
      <ul className={styles.grid}>
        {colourRoleRows().map((row) => (
          <li
            key={row.role}
            className={styles.card}
            data-testid={`colour-${row.role}`}
          >
            <code className={styles.cardName}>{row.role}</code>
            <div className={styles.swatchPair} aria-hidden="true">
              <div data-theme="light" className={styles.swatchFrame}>
                <span className={styles.swatch[row.role]} />
              </div>
              <div data-theme="dark" className={styles.swatchFrame}>
                <span className={styles.swatch[row.role]} />
              </div>
            </div>
            <dl className={`${styles.facts} ${styles.caption}`}>
              <dt className={styles.factTerm}>Light</dt>
              <dd className={styles.factValue}>{row.lightHex}</dd>
              <dt className={styles.factTerm}>Dark</dt>
              <dd className={styles.factValue}>{row.darkHex}</dd>
              <dt className={styles.factTerm}>Pair</dt>
              <dd className={styles.factValue}>
                {row.pair ? pairSummary(row.pair) : row.exempt}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </GuideSection>
  );
}

/** The contrast table: every enforced pair, measured in both themes. */
export function ContrastSection() {
  return (
    <GuideSection
      id="contrast"
      title="Contrast"
      intro="Measured with the theme package's contrast maths. A translucent surface is flattened over pure white and pure black and the worse result is shown; map overlays are measured on every representative basemap. Text needs 4.5:1 and icons, control edges and focus rings need 3:1 (WCAG 2.2 AA)."
    >
      <table className={styles.table} data-testid="contrast-table">
        <caption className={styles.tableCaption}>
          Contrast of every enforced colour pair
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.headCell}>
              Pair
            </th>
            <th scope="col" className={styles.headCell}>
              Needs
            </th>
            <th scope="col" className={styles.headCell}>
              Light
            </th>
            <th scope="col" className={styles.headCell}>
              Dark
            </th>
          </tr>
        </thead>
        <tbody>
          {contrastRows().map((row) => (
            <tr key={row.id} data-testid={`contrast-${row.id}`}>
              <th scope="row" className={styles.cell}>
                {row.label}
              </th>
              <td className={styles.cell}>{row.minimum}:1</td>
              <td className={styles.cell}>
                <Verdict result={row.light} />
              </td>
              <td className={styles.cell}>
                <Verdict result={row.dark} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </GuideSection>
  );
}

/** Sample copy for the type scale, written the way the app writes. */
const TYPE_SAMPLES: Record<keyof typeof typeScale, string> = {
  title: "Cape Town, Western Cape",
  large: "Drop a pin at the map centre",
  body: "Search places, compare basemaps and measure distances or areas.",
  small: "Map data from OpenStreetMap contributors",
};

/** Figures for the tabular numbers sample, so the columns can be compared. */
const FIGURES = ["1,111.1 km", "8,808.8 km", "-33.9249, 18.4241"];

/** The type scale with real copy, both weights and tabular figures. */
export function TypeSection() {
  const steps = Object.entries(typeScale).reverse() as [
    keyof typeof typeScale,
    (typeof typeScale)[keyof typeof typeScale],
  ][];
  return (
    <GuideSection
      id="type"
      title="Type"
      intro="IBM Plex Sans only, at weights 400 and 600. Sizes are in rem so they follow the reader's font size, and nothing is smaller than 13px."
    >
      <ul className={`${styles.list} ${styles.stack}`}>
        {steps.map(([name, step]) => (
          <li key={name} className={styles.card} data-testid={`type-${name}`}>
            <span className={styles.caption}>
              <code>{name}</code>: {remToPx(step.size)} ({step.size}), line
              height {step.lineHeight}, tracking {step.tracking}
            </span>
            <p className={`${styles.typeSample[name]} ${styles.regular}`}>
              {TYPE_SAMPLES[name]}
            </p>
            <p className={`${styles.typeSample[name]} ${styles.semibold}`}>
              {TYPE_SAMPLES[name]}
            </p>
          </li>
        ))}
      </ul>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3 className={styles.subTitle}>Weights</h3>
          <p className={styles.regular}>
            Regular, {fontWeight.regular}: body text and values.
          </p>
          <p className={styles.semibold}>
            Semibold, {fontWeight.semibold}: headings, labels and buttons.
          </p>
        </div>
        <div className={styles.card}>
          <h3 className={styles.subTitle}>Tabular numbers</h3>
          <div className={styles.swatchPair}>
            <div className={styles.stack}>
              <span className={styles.caption}>Proportional</span>
              {FIGURES.map((figure) => (
                <span key={figure} className={styles.proportional}>
                  {figure}
                </span>
              ))}
            </div>
            <div className={styles.stack}>
              <span className={styles.caption}>Tabular</span>
              {FIGURES.map((figure) => (
                <span key={figure} className={styles.figures}>
                  {figure}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GuideSection>
  );
}

/** The spacing scale and the screen inset, as bars as wide as each token. */
export function SpacingSection() {
  const steps = Object.entries({ ...space, inset }) as [
    keyof typeof styles.spaceBar,
    string,
  ][];
  return (
    <GuideSection
      id="spacing"
      title="Spacing"
      intro="Gaps, padding and margins come from this scale. The inset is the distance from the screen edge to floating chrome."
    >
      <ul className={`${styles.list} ${styles.stack}`}>
        {steps.map(([name, value]) => (
          <li key={name} className={styles.spaceRow}>
            <span>
              <code>{name}</code>{" "}
              <span className={styles.caption}>{value}</span>
            </span>
            <span className={styles.spaceBar[name]} aria-hidden="true" />
          </li>
        ))}
      </ul>
    </GuideSection>
  );
}

/** Corner radii by role. */
export function RadiiSection() {
  return (
    <GuideSection
      id="radii"
      title="Radii"
      intro="One radius per role. Fully circular elements use round."
    >
      <ul className={styles.narrowGrid}>
        {(Object.entries(radius) as [keyof typeof radius, string][]).map(
          ([name, value]) => (
            <li key={name} className={styles.iconTile}>
              <span className={styles.radiusBox[name]} aria-hidden="true" />
              <code>{name}</code>
              <span className={styles.caption}>{value}</span>
            </li>
          ),
        )}
      </ul>
    </GuideSection>
  );
}

/** The two elevation shadows. */
export function ElevationSection() {
  const uses = {
    floating: "Control groups, the search pill and messages",
    sheet: "The bottom sheet and side panel",
  } as const;
  return (
    <GuideSection
      id="elevation"
      title="Elevation"
      intro="Two shadows, each with light and dark values. Floating elements have no border; hairlines appear only inside lists and between grouped controls."
    >
      <ul className={styles.elevationGrid}>
        {(Object.keys(themeValues.light.shadow) as (keyof typeof uses)[]).map(
          (name) => (
            <li key={name} className={styles.elevationBox[name]}>
              <span className={styles.stack}>
                <code>{name}</code>
                <span className={styles.caption}>{uses[name]}</span>
              </span>
            </li>
          ),
        )}
      </ul>
    </GuideSection>
  );
}

/** Motion durations, the easing curve and the reduced-motion value. */
export function MotionSection() {
  const rows: [string, string, string][] = [
    ["fast", motion.duration.fast, "Hover and press feedback"],
    ["base", motion.duration.base, "Popovers, toasts and fades"],
    ["slow", motion.duration.slow, "The sheet moving between detents"],
    ["easing", motion.easing, "Every transition except the sheet"],
    ["spring", motion.spring, "The sheet only"],
    [
      "reduced",
      motion.durationReduced,
      "Every duration when reduced motion is on",
    ],
  ];
  return (
    <GuideSection
      id="motion"
      title="Motion"
      intro="Only transform and opacity animate. With reduced motion every duration drops to almost nothing, including the map's own animation."
    >
      <table className={styles.table}>
        <caption className={styles.tableCaption}>Motion tokens</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.headCell}>
              Token
            </th>
            <th scope="col" className={styles.headCell}>
              Value
            </th>
            <th scope="col" className={styles.headCell}>
              Used for
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, value, use]) => (
            <tr key={name}>
              <th scope="row" className={styles.cell}>
                <code>{name}</code>
              </th>
              <td className={`${styles.cell} ${styles.caption}`}>{value}</td>
              <td className={styles.cell}>{use}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GuideSection>
  );
}

/** The named z layers, drawn bottom to top. */
export function LayersSection() {
  return (
    <GuideSection
      id="layers"
      title="Z layers"
      intro="Components name a layer and never write a number. The list reads top to bottom as the layers stack on screen."
    >
      <ol className={styles.layerList}>
        {tokenValues.zLayerOrder.map((name) => (
          <li key={name} className={styles.layerItem} data-layer={name}>
            <code>{name}</code>
            <span className={styles.caption}>{tokenValues.zIndex[name]}</span>
          </li>
        ))}
      </ol>
    </GuideSection>
  );
}

/** Every Lucide icon the app imports, drawn through `Icon`. */
export function IconsSection() {
  return (
    <GuideSection
      id="icons"
      title="Icons"
      intro="Lucide only, imported by name, drawn at 24px with one stroke width through the Icon component. This is every icon the app imports."
    >
      <ul className={styles.narrowGrid}>
        {Object.entries(APP_ICONS).map(([name, glyph]) => (
          <li key={name} className={styles.iconTile}>
            <Icon icon={glyph} />
            <span className={styles.caption}>{name}</span>
          </li>
        ))}
      </ul>
    </GuideSection>
  );
}
