// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MapPin } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useMessages } from "../../services";
import { Button } from "../../ui/Button";
import { type HeadingLevel, Section } from "../Section";
import { prose } from "../Section/Section.css";

/** Props for {@link PinSection}. */
export interface PinSectionProps {
  /** Whether a pin is on the map. */
  readonly hasPin: boolean;
  /** Drops a pin at the centre of the map. */
  readonly onDropPin: () => void;
  /** The pin's details, such as the pin card, shown under the note. */
  readonly children?: ReactNode;
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The pin: a button that drops a pin at the centre of the map, which is the
 * button equivalent of a long press and of the P key, and a note while a pin
 * is on the map. The pin's details are the caller's `children`.
 */
export function PinSection({
  hasPin,
  onDropPin,
  children,
  headingLevel = 3,
  headingRef,
}: PinSectionProps) {
  const { t } = useMessages();
  return (
    <Section
      title={t("panels.pin.title", {})}
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-pin"
    >
      <Button
        variant="secondary"
        icon={MapPin}
        onClick={onDropPin}
        data-testid="drop-pin-button"
      >
        {t("panels.pin.drop", {})}
      </Button>
      {hasPin ? (
        <p className={prose} data-testid="pin-note">
          {t("panels.pin.note", {})}
        </p>
      ) : null}
      {children}
    </Section>
  );
}
