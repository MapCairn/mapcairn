import { DRAW_KEY_HELP, MAP_KEY_HELP } from "@karta/core";
import type { Ref } from "react";
import { usePreferences } from "../../services";
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
}

/**
 * Help: the keyboard shortcuts and a statement of the accessibility target.
 * @remarks The Keyboard group is shown only when the primary pointer is fine
 *   (a mouse or trackpad), the signal this app uses for "has a keyboard". On a
 *   touch device it is left out entirely rather than replaced by a hint. A
 *   keyboard attached to a touch device is not detected, so the same shortcuts
 *   stay in the map's own hidden keyboard instructions.
 */
export function HelpSection({
  headingLevel = 3,
  headingRef,
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
          Karta aims to meet WCAG 2.2 level AA. Every action that uses a
          gesture, such as a long press or a drag, also has a button or a
          keyboard shortcut.
        </p>
      </div>
    </Section>
  );
}
