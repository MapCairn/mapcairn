import {
  announceProjection,
  type MapProjection,
  type ThemeChoice,
  type UnitSystem,
} from "@mapcairn/core";
import { Info } from "lucide-react";
import type { Ref } from "react";
import {
  usePreferences,
  useSaveData,
  useSettings,
  useTheme,
} from "../../services";
import { Icon } from "../../ui/Icon";
import { useAnnounce } from "../../ui/LiveRegion";
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

const PROJECTION_OPTIONS: readonly { value: MapProjection; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "globe", label: "Globe" },
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
 * The settings: theme, units, map shape (flat or globe), zoom buttons and Save data, a note when changes
 * will not be remembered, and a short privacy statement with a link to the
 * policy.
 * @remarks The zoom switch shows the stored choice, or the device default
 *   (on with a mouse, off on touch) while nothing is stored. Toggling it stores
 *   an explicit boolean, so a person who turns it on keeps it on everywhere.
 *   The Save data switch works the same way: its default is the device's
 *   signal (a data saver or a very slow connection, where the browser reports
 *   one), and a person's own choice always wins.
 */
export function SettingsSection({
  headingLevel = 3,
  privacyHref = "/privacy",
  headingRef,
}: SettingsSectionProps) {
  const { choice, setChoice } = useTheme();
  const { settings, update, persistent } = useSettings();
  const { finePointer } = usePreferences();
  const saveData = useSaveData();
  const announce = useAnnounce();
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
      <div className={field}>
        <p className={fieldLabel} aria-hidden="true">
          Map shape
        </p>
        <SegmentedControl
          label="Map shape"
          options={PROJECTION_OPTIONS}
          value={settings.projection}
          onValueChange={(next) => {
            update({ projection: next as MapProjection });
            announce(announceProjection(next as MapProjection));
          }}
          data-testid="projection-option"
        />
      </div>
      <Switch
        label="Show zoom buttons"
        description="On by default with a mouse, off on touch screens."
        checked={settings.zoomButtons ?? finePointer}
        onCheckedChange={(next) => update({ zoomButtons: next })}
        data-testid="zoom-buttons-switch"
      />
      <Switch
        label="Save data"
        description="Shows map names instead of previews and leaves out heavy map layers."
        checked={saveData}
        onCheckedChange={(next) => update({ saveData: next })}
        data-testid="save-data-switch"
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
          MapCairn has no accounts, sets no cookies and counts page views
          without tracking you. Map tiles come from the map provider you choose.
          Searching sends your query to OpenStreetMap's Nominatim service, and
          Look up address on a pin sends the pin's position, to about 11 m, to
          the same service. Nothing is sent to it until you do one of those. A
          data layer contacts its provider only while it is on. Your settings
          stay on this device.
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
