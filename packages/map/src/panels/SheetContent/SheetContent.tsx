import type { SheetSection } from "@karta/core";
import { type ReactNode, useEffect, useRef } from "react";
import { usePreferences } from "../../services";
import { BasemapPicker } from "../BasemapPicker";
import { DataSection } from "../DataSection";
import { HelpSection } from "../HelpSection";
import { PinSection } from "../PinSection";
import { Section } from "../Section";
import { SettingsSection } from "../SettingsSection";
import { content } from "./SheetContent.css";

/** Props for {@link SheetContent}. */
export interface SheetContentProps {
  /** The chosen basemap id. */
  readonly basemapId: string;
  /** Called with the basemap id the user chose. */
  readonly onBasemapChange: (id: string) => void;
  /** Whether a pin is on the map. */
  readonly hasPin: boolean;
  /** Drops a pin at the centre of the map. */
  readonly onDropPin: () => void;
  /**
   * The section to bring into view. When it changes, the section scrolls to
   * the top of the sheet and its heading takes focus. Choosing the same
   * section again while this component stays mounted does nothing, so the
   * caller should unmount the content when the sheet closes.
   */
  readonly section?: SheetSection;
  /** The pin's details, shown inside the Pin section. */
  readonly pinCard?: ReactNode;
  /** Where the privacy policy is. Defaults to `/privacy`. */
  readonly privacyHref?: string;
}

/**
 * Everything inside the options sheet, under the sheet's own h2 title: Basemap,
 * Pin, Data (only when the host has layers), Settings and Help, each a
 * `section` named by an h3.
 */
export function SheetContent({
  basemapId,
  onBasemapChange,
  hasPin,
  onDropPin,
  section,
  pinCard,
  privacyHref,
}: SheetContentProps) {
  const { reducedMotion } = usePreferences();
  const headings = useRef<Partial<Record<SheetSection, HTMLElement | null>>>(
    {},
  );

  // Only a change of section moves focus and scroll, not a change in motion
  // preference, so it is read through the render that ran it.
  const motion = useRef(reducedMotion);
  motion.current = reducedMotion;
  useEffect(() => {
    const heading = section ? headings.current[section] : null;
    if (!heading) {
      return;
    }
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({
      block: "start",
      behavior: motion.current ? "auto" : "smooth",
    });
  }, [section]);

  const headingRef =
    (target: SheetSection) => (element: HTMLElement | null) => {
      headings.current[target] = element;
    };

  return (
    <div className={content} data-testid="sheet-content">
      <Section
        title="Basemap"
        headingRef={headingRef("basemap")}
        data-testid="sheet-section-basemap"
      >
        <BasemapPicker value={basemapId} onChange={onBasemapChange} />
      </Section>
      <PinSection
        hasPin={hasPin}
        onDropPin={onDropPin}
        headingRef={headingRef("pin")}
      >
        {pinCard}
      </PinSection>
      <DataSection headingRef={headingRef("layers")} />
      <SettingsSection
        privacyHref={privacyHref}
        headingRef={headingRef("settings")}
      />
      <HelpSection headingRef={headingRef("help")} />
    </div>
  );
}
