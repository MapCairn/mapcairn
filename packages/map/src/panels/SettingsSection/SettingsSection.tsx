// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceProjection,
  type MapProjection,
  type MessageCatalogue,
  type ThemeChoice,
  type UnitSystem,
} from "@mapcairn/core";
import { Info } from "lucide-react";
import type { ReactNode, Ref } from "react";
import {
  useMessages,
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

function themeOptions(
  t: MessageCatalogue["t"],
): readonly { value: ThemeChoice; label: string }[] {
  return [
    { value: "system", label: t("settings.theme.system", {}) },
    { value: "light", label: t("settings.theme.light", {}) },
    { value: "dark", label: t("settings.theme.dark", {}) },
  ];
}

function unitOptions(
  t: MessageCatalogue["t"],
): readonly { value: UnitSystem; label: string }[] {
  return [
    { value: "metric", label: t("settings.units.metric", {}) },
    { value: "imperial", label: t("settings.units.imperial", {}) },
  ];
}

function projectionOptions(
  t: MessageCatalogue["t"],
): readonly { value: MapProjection; label: string }[] {
  return [
    { value: "flat", label: t("settings.mapShape.flat", {}) },
    { value: "globe", label: t("settings.mapShape.globe", {}) },
  ];
}

/**
 * The default privacy statement. It names no provider, because the SDK does not
 * know which services a host uses; a host replaces it with one that does.
 */
export const DEFAULT_PRIVACY_NOTE =
  "The privacy policy says what each service this map uses receives.";

/** Props for {@link SettingsSection}. */
export interface SettingsSectionProps {
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Where the privacy policy is. Defaults to `/privacy`. */
  readonly privacyHref?: string;
  /**
   * The host's privacy statement, shown under the Privacy heading. Defaults to
   * {@link DEFAULT_PRIVACY_NOTE}. A host names its own providers here and says
   * what it sends to each. Phrasing content only: it sits inside a paragraph.
   */
  readonly privacyNote?: ReactNode;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The settings: theme, units, map shape (flat or globe), zoom buttons and Save data, a note when changes
 * will not be remembered, and a short privacy statement (the host's, or
 * {@link DEFAULT_PRIVACY_NOTE}) with a link to the policy.
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
  privacyNote = DEFAULT_PRIVACY_NOTE,
  headingRef,
}: SettingsSectionProps) {
  const { choice, setChoice } = useTheme();
  const { settings, update, persistent } = useSettings();
  const { finePointer } = usePreferences();
  const saveData = useSaveData();
  const announce = useAnnounce();
  const { t } = useMessages();
  const subLevel = nextHeadingLevel(headingLevel);
  const themeLabel = t("settings.theme.label", {});
  const unitsLabel = t("settings.units.label", {});
  const mapShapeLabel = t("settings.mapShape.label", {});
  return (
    <Section
      title={t("settings.title", {})}
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-settings"
    >
      <div className={field}>
        <p className={fieldLabel} aria-hidden="true">
          {themeLabel}
        </p>
        <SegmentedControl
          label={themeLabel}
          options={themeOptions(t)}
          value={choice}
          onValueChange={(next) => setChoice(next as ThemeChoice)}
          data-testid="theme-option"
        />
      </div>
      <div className={field}>
        <p className={fieldLabel} aria-hidden="true">
          {unitsLabel}
        </p>
        <SegmentedControl
          label={unitsLabel}
          options={unitOptions(t)}
          value={settings.units}
          onValueChange={(next) => update({ units: next as UnitSystem })}
          data-testid="units-option"
        />
      </div>
      <div className={field}>
        <p className={fieldLabel} aria-hidden="true">
          {mapShapeLabel}
        </p>
        <SegmentedControl
          label={mapShapeLabel}
          options={projectionOptions(t)}
          value={settings.projection}
          onValueChange={(next) => {
            update({ projection: next as MapProjection });
            announce(announceProjection(next as MapProjection));
          }}
          data-testid="projection-option"
        />
      </div>
      <Switch
        label={t("settings.zoomButtons.label", {})}
        description={t("settings.zoomButtons.description", {})}
        checked={settings.zoomButtons ?? finePointer}
        onCheckedChange={(next) => update({ zoomButtons: next })}
        data-testid="zoom-buttons-switch"
      />
      <Switch
        label={t("settings.saveData.label", {})}
        description={t("settings.saveData.description", {})}
        checked={saveData}
        onCheckedChange={(next) => update({ saveData: next })}
        data-testid="save-data-switch"
      />
      {persistent ? null : (
        <p className={note} data-testid="settings-not-saved">
          <Icon icon={Info} className={noteIcon} />
          {t("settings.notSaved", {})}
        </p>
      )}
      <div className={subsection}>
        <Subheading level={subLevel}>
          {t("settings.privacy.heading", {})}
        </Subheading>
        <p className={prose} data-testid="settings-privacy-note">
          {privacyNote}
        </p>
        <p className={prose}>
          <a className={link} href={privacyHref}>
            {t("settings.privacy.link", {})}
          </a>
        </p>
      </div>
    </Section>
  );
}
