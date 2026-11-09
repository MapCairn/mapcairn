import {
  AUTO_BASEMAP_ID,
  resolveBasemap,
  type SheetSection,
} from "@karta/core";
import { type ReactNode, useEffect, useRef } from "react";
import { usePreferences, useTheme } from "../../services";
import { BasemapPicker } from "../BasemapPicker";
import { DataSection } from "../DataSection";
import { HelpSection } from "../HelpSection";
import { PinSection } from "../PinSection";
import { Section } from "../Section";
import { SettingsSection } from "../SettingsSection";
import { content } from "./SheetContent.css";

/** Props for {@link SheetContent}. */
export interface SheetContentProps {
  /** The stored basemap choice: a basemap id, or `AUTO_BASEMAP_ID`. */
  readonly basemapId: string;
  /** Called with the basemap id or `AUTO_BASEMAP_ID` the user chose. */
  readonly onBasemapChange: (id: string) => void;
  /** Whether a pin is on the map. */
  readonly hasPin: boolean;
  /** Drops a pin at the centre of the map. */
  readonly onDropPin: () => void;
  /** Whether the map engine can rotate, which decides which shortcuts are listed. */
  readonly supportsRotation: boolean;
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
 * @remarks Switching "Match the map to the theme" on stores `AUTO_BASEMAP_ID`.
 *   Switching it off keeps the basemap that was showing, so the map does not
 *   change under the person.
 */
export function SheetContent({
  basemapId,
  onBasemapChange,
  hasPin,
  onDropPin,
  supportsRotation,
  section,
  pinCard,
  privacyHref,
}: SheetContentProps) {
  const { resolved } = useTheme();
  const { reducedMotion } = usePreferences();
  const headings = useRef<Partial<Record<SheetSection, HTMLElement | null>>>(
    {},
  );
  const activeBasemapId = resolveBasemap(basemapId, resolved).id;
  const themeMatch = basemapId === AUTO_BASEMAP_ID;

  // Only a change of section moves focus and scroll, not a change in motion
  // preference or theme, so those are read through the render that ran it.
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
        <BasemapPicker
          value={basemapId}
          onChange={onBasemapChange}
          themeMatch={themeMatch}
          onThemeMatchChange={(next) =>
            onBasemapChange(next ? AUTO_BASEMAP_ID : activeBasemapId)
          }
          activeBasemapId={activeBasemapId}
        />
      </Section>
      <PinSection
        hasPin={hasPin}
        onDropPin={onDropPin}
        headingRef={headingRef("pin")}
      >
        {pinCard}
      </PinSection>
      <DataSection headingRef={headingRef("data")} />
      <SettingsSection
        privacyHref={privacyHref}
        headingRef={headingRef("settings")}
      />
      <HelpSection
        supportsRotation={supportsRotation}
        headingRef={headingRef("help")}
      />
    </div>
  );
}
