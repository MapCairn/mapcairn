import { DRAW_KEY_HELP, MAP_KEY_HELP } from "@mapcairn/core";
import type { Ref } from "react";
import { usePreferences } from "../../services";
import { Button } from "../../ui/Button";
import {
  type HeadingLevel,
  nextHeadingLevel,
  Section,
  Subheading,
} from "../Section";
import { prose, subsection } from "../Section/Section.css";
import { action, keys, shortcut, shortcuts } from "./HelpSection.css";

/** Props for {@link HelpSection}. */
export interface HelpSectionProps {
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** Starts the first-visit tour. Without it Help offers no tour. */
  readonly onStartTour?: () => void;
}

/**
 * Help: what the search box accepts, the keyboard shortcuts and a statement
 * of the accessibility target.
 * @remarks The Keyboard group is shown only when the primary pointer is fine
 *   (a mouse or trackpad), the signal this app uses for "has a keyboard". On a
 *   touch device it is left out entirely rather than replaced by a hint. A
 *   keyboard attached to a touch device is not detected, so the same shortcuts
 *   stay in the map's own hidden keyboard instructions.
 */
export function HelpSection({
  headingLevel = 3,
  headingRef,
  onStartTour,
}: HelpSectionProps) {
  const { finePointer } = usePreferences();
  const subLevel = nextHeadingLevel(headingLevel);
  return (
    <Section
      title="Help"
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-help"
    >
      {onStartTour ? (
        <div className={subsection}>
          <Subheading level={subLevel}>Tour</Subheading>
          <p className={prose}>
            A few short steps that show the main controls by using them.
          </p>
          <div>
            <Button variant="secondary" onClick={onStartTour}>
              Take the tour
            </Button>
          </div>
        </div>
      ) : null}
      <div className={subsection} data-testid="help-search">
        <Subheading level={subLevel}>Search</Subheading>
        <p className={prose}>
          Type a place name or a pair of coordinates, such as -26.2041, 28.0473
          or 26.2041° S, 28.0473° E, then press Enter. Coordinates are read on
          this device and sent nowhere.
        </p>
      </div>
      {finePointer ? (
        <div className={subsection} data-testid="help-keyboard">
          <Subheading level={subLevel}>Keyboard</Subheading>
          <dl className={shortcuts}>
            {MAP_KEY_HELP.map((entry) => (
              <div key={entry.keys} className={shortcut}>
                <dt className={keys}>{entry.keys}</dt>
                <dd className={action}>{entry.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {finePointer ? (
        <div className={subsection} data-testid="help-drawing">
          <Subheading level={subLevel}>Drawing</Subheading>
          <dl className={shortcuts}>
            {DRAW_KEY_HELP.map((entry) => (
              <div key={entry.keys} className={shortcut}>
                <dt className={keys}>{entry.keys}</dt>
                <dd className={action}>{entry.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <div className={subsection}>
        <Subheading level={subLevel}>Accessibility</Subheading>
        <p className={prose}>
          MapCairn aims to meet WCAG 2.2 level AA. Every action that uses a
          gesture, such as a long press or a drag, also has a button or a
          keyboard shortcut.
        </p>
      </div>
    </Section>
  );
}
