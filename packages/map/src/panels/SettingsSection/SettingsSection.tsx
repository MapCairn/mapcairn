import type { ThemeChoice, UnitSystem } from "@karta/core";
import { Info } from "lucide-react";
import type { Ref } from "react";
import { usePreferences, useSettings, useTheme } from "../../services";
import { Icon } from "../../ui/Icon";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { Switch } from "../../ui/Switch";
import {
  type HeadingLevel,
  nextHeadingLevel,
  Section,
  Subheading,
} from "../Section";
import {
  link,
  note,
  noteIcon,
  prose,
  subsection,
} from "../Section/Section.css";
import { field, fieldLabel } from "./SettingsSection.css";

const THEME_OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const UNIT_OPTIONS: readonly { value: UnitSystem; label: string }[] = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" },
];

/** Props for {@link SettingsSection}. */
export interface SettingsSectionProps {
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Where the privacy policy is. Defaults to `/privacy`. */
  readonly privacyHref?: string;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The settings: theme, units and zoom buttons, a note when changes will not be
 * remembered, and a short privacy statement with a link to the policy.
 * @remarks The zoom switch shows the stored choice, or the device default
 *   (on with a mouse, off on touch) while nothing is stored. Toggling it stores
 *   an explicit boolean, so a person who turns it on keeps it on everywhere.
 */
export function SettingsSection({
  headingLevel = 3,
  privacyHref = "/privacy",
  headingRef,
}: SettingsSectionProps) {
  const { choice, setChoice } = useTheme();
  const { settings, update, persistent } = useSettings();
  const { finePointer } = usePreferences();
  const subLevel = nextHeadingLevel(headingLevel);
  return (
    <Section
      title="Settings"
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-settings"
    >
      <div className={field}>
        <p className={fieldLabel} aria-hidden="true">
          Theme
        </p>
        <SegmentedControl
          label="Theme"
          options={THEME_OPTIONS}
          value={choice}
          onValueChange={(next) => setChoice(next as ThemeChoice)}
          data-testid="theme-option"
        />
      </div>
      <div className={field}>
        <p className={fieldLabel} aria-hidden="true">
          Units
        </p>
        <SegmentedControl
          label="Units"
          options={UNIT_OPTIONS}
          value={settings.units}
          onValueChange={(next) => update({ units: next as UnitSystem })}
          data-testid="units-option"
        />
      </div>
      <Switch
        label="Show zoom buttons"
        description="On by default with a mouse, off on touch screens."
        checked={settings.zoomButtons ?? finePointer}
        onCheckedChange={(next) => update({ zoomButtons: next })}
        data-testid="zoom-buttons-switch"
      />
      {persistent ? null : (
        <p className={note} data-testid="settings-not-saved">
          <Icon icon={Info} className={noteIcon} />
          Changes will not be remembered on this device.
        </p>
      )}
      <div className={subsection}>
        <Subheading level={subLevel}>Privacy</Subheading>
        <p className={prose}>
          Karta has no accounts, no analytics and sets no cookies. Map tiles
          come from the map provider you choose. Search text is sent to
          OpenStreetMap's Nominatim service. Your settings stay on this device.
        </p>
        <p className={prose}>
          <a className={link} href={privacyHref}>
            Read the privacy policy
          </a>
        </p>
      </div>
    </Section>
  );
}
