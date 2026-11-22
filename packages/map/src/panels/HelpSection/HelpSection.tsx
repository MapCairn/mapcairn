// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { DRAW_KEY_HELP, MAP_KEY_HELP, resolveText } from "@mapcairn/core";
import type { Ref } from "react";
import { useMessages, usePreferences } from "../../services";
import { Button } from "../../ui/Button";
import { isSitePath, isWebAddress } from "../../ui/linkAddress";
import { VisuallyHidden } from "../../ui/VisuallyHidden";
import {
  type HeadingLevel,
  nextHeadingLevel,
  Section,
  Subheading,
} from "../Section";
import { link, prose, subsection } from "../Section/Section.css";
import { action, keys, shortcut, shortcuts } from "./HelpSection.css";

/** A link in the About block: where it goes and what it is called. */
export interface HelpAboutLink {
  /** The host must supply a trusted address, as with its other links. */
  readonly href: string;
  /** A name that says where the link goes, not "click here". */
  readonly label: string;
}

/**
 * A host's About block in Help: a heading, a line of text, one link out and,
 * optionally, a link to the host's own page about the site. The link out is
 * drawn only when its address is an absolute http or https one, and the
 * own-page link only when it is that or a path on the site; otherwise Help
 * shows the block without it.
 */
export interface HelpAbout {
  /** The block's heading, in the host's words. */
  readonly heading: string;
  /** What the host wants to say about the site, as plain text. */
  readonly text: string;
  /** A link out, opened in a new tab and announced as doing so. */
  readonly link: HelpAboutLink;
  /**
   * A link to the host's own page about the site (a product or home page),
   * shown before the link out and opened in the same tab, like the privacy
   * policy link in Settings.
   */
  readonly homeLink?: HelpAboutLink;
}

/** Props for {@link HelpSection}. */
export interface HelpSectionProps {
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** Starts the first-visit tour. Without it Help offers no tour. */
  readonly onStartTour?: () => void;
  /**
   * The host's About block, shown below the other subsections. Without it Help
   * has none. Its link address must be a trusted http or https one that the
   * host supplies; any other address leaves the link out.
   */
  readonly about?: HelpAbout;
}

/**
 * Help: what the search box accepts, the keyboard shortcuts, a statement
 * of the accessibility target and, when the host supplies one, its About block.
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
  about,
}: HelpSectionProps) {
  const { finePointer } = usePreferences();
  const messages = useMessages();
  const { t } = messages;
  const subLevel = nextHeadingLevel(headingLevel);
  return (
    <Section
      title={t("panels.help.title", {})}
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-help"
    >
      {onStartTour ? (
        <div className={subsection}>
          <Subheading level={subLevel}>
            {t("panels.help.tourHeading", {})}
          </Subheading>
          <p className={prose}>{t("panels.help.tourDescription", {})}</p>
          <div>
            <Button variant="secondary" onClick={onStartTour}>
              {t("panels.help.tourStart", {})}
            </Button>
          </div>
        </div>
      ) : null}
      <div className={subsection} data-testid="help-search">
        <Subheading level={subLevel}>
          {t("panels.help.searchHeading", {})}
        </Subheading>
        <p className={prose}>{t("panels.help.searchDescription", {})}</p>
      </div>
      {finePointer ? (
        <div className={subsection} data-testid="help-keyboard">
          <Subheading level={subLevel}>
            {t("panels.help.keyboardHeading", {})}
          </Subheading>
          <dl className={shortcuts}>
            {MAP_KEY_HELP.map((entry) => (
              <div key={entry.keys} className={shortcut}>
                <dt className={keys}>{resolveText(messages, entry.keys)}</dt>
                <dd className={action}>
                  {resolveText(messages, entry.description)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {finePointer ? (
        <div className={subsection} data-testid="help-drawing">
          <Subheading level={subLevel}>
            {t("panels.help.drawingHeading", {})}
          </Subheading>
          <dl className={shortcuts}>
            {DRAW_KEY_HELP.map((entry) => (
              <div key={entry.keys} className={shortcut}>
                <dt className={keys}>{resolveText(messages, entry.keys)}</dt>
                <dd className={action}>
                  {resolveText(messages, entry.description)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <div className={subsection}>
        <Subheading level={subLevel}>
          {t("panels.help.accessibilityHeading", {})}
        </Subheading>
        <p className={prose}>{t("panels.help.accessibilityDescription", {})}</p>
      </div>
      {about ? (
        <div className={subsection} data-testid="help-about">
          <Subheading level={subLevel}>{about.heading}</Subheading>
          <p className={prose}>{about.text}</p>
          {about.homeLink &&
          (isSitePath(about.homeLink.href) ||
            isWebAddress(about.homeLink.href)) ? (
            <p className={prose}>
              <a className={link} href={about.homeLink.href}>
                {about.homeLink.label}
              </a>
            </p>
          ) : null}
          {isWebAddress(about.link.href) ? (
            <p className={prose}>
              <a
                className={link}
                href={about.link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {about.link.label}
                <VisuallyHidden>
                  {" "}
                  {t("layers.card.opensInNewTab", {})}
                </VisuallyHidden>
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
