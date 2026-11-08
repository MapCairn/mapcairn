import type { ThemePreference } from "@karta/react";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";

/** Localised labels accepted by {@link ThemeToggle}. */
export interface ThemeToggleLabels {
  label?: string;
  optionLabels?: Partial<
    Record<ThemePreference, { label: string; ariaLabel: string }>
  >;
}

interface ThemeToggleProps extends ThemeToggleLabels {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}

const THEME_OPTIONS: {
  id: ThemePreference;
  label: string;
  ariaLabel: string;
}[] = [
  { id: "system", label: "System", ariaLabel: "System theme" },
  { id: "light", label: "Light", ariaLabel: "Light theme" },
  { id: "dark", label: "Dark", ariaLabel: "Dark theme" },
];

/** A `SegmentedControl` for choosing between system/light/dark theme preference. */
export function ThemeToggle({
  preference,
  onChange,
  label = "Theme",
  optionLabels,
}: ThemeToggleProps) {
  return (
    <SegmentedControl
      label={label}
      options={THEME_OPTIONS.map((option) => ({
        ...option,
        ...optionLabels?.[option.id],
      }))}
      value={preference}
      onChange={onChange}
      testId="theme"
    />
  );
}
