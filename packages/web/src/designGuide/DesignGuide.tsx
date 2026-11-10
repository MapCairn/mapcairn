import type { ThemeChoice } from "@mapcairn/core";
import { SegmentedControl, SkipLink, useTheme } from "@mapcairn/map";
import { ClientOnly } from "../app/ClientOnly";
import { ComponentsSection } from "./ComponentSections";
import * as styles from "./DesignGuide.css";
import { FontSection } from "./FontSection";
import {
  ColourSection,
  ContrastSection,
  ElevationSection,
  IconsSection,
  LayersSection,
  MotionSection,
  RadiiSection,
  SpacingSection,
  TypeSection,
} from "./FoundationSections";
import type { FontGateResult } from "./fontGate";

export { COMPONENT_NAMES } from "./ComponentSections";

/**
 * A unique string that appears in the build output only when this page is
 * bundled. `packages/web/scripts/verifyNoTestSeam.mjs` fails a production
 * build that contains it and an e2e build that does not, so renaming it
 * means updating that script.
 */
export const DESIGN_GUIDE_MARKER = "MAPCAIRN_DESIGN_GUIDE_MARKER";

/** The id of the `main` element the skip link moves focus to. */
const MAIN_ID = "design-guide-main";

/** The page's sections, in order: the nav and the tests read this list. */
export const GUIDE_SECTIONS = [
  { id: "colour", title: "Colour" },
  { id: "contrast", title: "Contrast" },
  { id: "type", title: "Type" },
  { id: "font", title: "Font" },
  { id: "spacing", title: "Spacing" },
  { id: "radii", title: "Radii" },
  { id: "elevation", title: "Elevation" },
  { id: "motion", title: "Motion" },
  { id: "layers", title: "Z layers" },
  { id: "icons", title: "Icons" },
  { id: "components", title: "Components" },
] as const;

const THEME_OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * The page theme, set through the real theme service (`useTheme`), so it is
 * stored and applied exactly as the map's settings panel does it.
 */
function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  return (
    <SegmentedControl
      label="Theme"
      options={THEME_OPTIONS}
      value={choice}
      onValueChange={(next) => setChoice(next as ThemeChoice)}
      data-testid="design-theme"
    />
  );
}

/** Props for {@link DesignGuide}. */
export interface DesignGuideProps {
  /** Runs the font gate. Tests pass a scripted result. */
  readonly checkFont: () => Promise<FontGateResult>;
}

/**
 * The living style guide: every token and every primitive, built from the
 * real components and token values. Served at `/design` in development and
 * e2e builds only (see `designGuideRoutes.ts`).
 *
 * @remarks It server-renders like any page of the host. Demos built on Radix
 *   and the theme control render after hydration, because Radix writes
 *   inline styles that the strict style CSP blocks and the theme depends on
 *   stored settings.
 */
export function DesignGuide({ checkFont }: DesignGuideProps) {
  return (
    <div className={styles.scroller}>
      <SkipLink targetId={MAIN_ID}>Skip to content</SkipLink>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Design system</h1>
          <p className={styles.prose}>
            MapCairn's tokens and components, rendered from the code. This page
            exists only in development and test builds.
          </p>
        </div>
        <div className={styles.themeControl}>
          <span className={styles.caption}>Page theme</span>
          <ClientOnly
            fallback={
              <span className={styles.caption}>Loading the theme control</span>
            }
          >
            <ThemeToggle />
          </ClientOnly>
        </div>
      </header>
      <nav aria-label="On this page" className={styles.navBar}>
        <ul className={styles.navList}>
          {GUIDE_SECTIONS.map((section) => (
            <li key={section.id}>
              <a className={styles.navLink} href={`#${section.id}`}>
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className={styles.main}
        data-design-guide={DESIGN_GUIDE_MARKER}
        data-testid="design-guide"
      >
        <ColourSection />
        <ContrastSection />
        <TypeSection />
        <FontSection checkFont={checkFont} />
        <SpacingSection />
        <RadiiSection />
        <ElevationSection />
        <MotionSection />
        <LayersSection />
        <IconsSection />
        <ComponentsSection />
      </main>
    </div>
  );
}
