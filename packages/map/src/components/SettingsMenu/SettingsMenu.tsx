import { type ThemePreference, useLatestRef } from "@karta/react";
import { Settings, X } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { type Basemap, getBasemapDefinition } from "../../constants/basemaps";
import { useDismissableOverlay } from "../../hooks/useDismissableOverlay";
import { BasemapToggle } from "../BasemapToggle/BasemapToggle";
import { IconButton } from "../IconButton/IconButton";
import {
  ThemeToggle,
  type ThemeToggleLabels,
} from "../ThemeToggle/ThemeToggle";
import * as styles from "./SettingsMenu.css";

interface SettingsMenuLabels {
  openLabel?: string;
  closeLabel?: string;
  title?: string;
  basemapLabel?: string;
  basemapOptionAriaLabel?: (label: string) => string;
  themeLabel?: string;
  themeOptionLabels?: ThemeToggleLabels["optionLabels"];
  showBasemap?: boolean;
}

interface SettingsMenuProps {
  /** Controlled visibility; omit to let the menu manage its own open state. */
  open?: boolean;
  basemap: Basemap;
  onBasemapChange: (basemap: Basemap) => void;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  labels?: SettingsMenuLabels;
  /** Called whenever the menu opens or closes, e.g. so a caller can hide other overlays it would cover. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Extra controls rendered after the built-in basemap/theme ones, e.g. a
   * caller-specific language switcher. Kept as a generic slot rather than
   * a named prop so this domain-agnostic component doesn't need to know
   * what any particular caller wants to put here.
   */
  children?: ReactNode;
}

/** A dropdown menu combining basemap and theme preference controls, plus any caller-supplied `children`. */
export function SettingsMenu({
  open: controlledOpen,
  basemap,
  onBasemapChange,
  themePreference,
  onThemePreferenceChange,
  labels,
  onOpenChange,
  children,
}: SettingsMenuProps) {
  const showBasemap = labels?.showBasemap ?? true;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onOpenChangeRef = useLatestRef(onOpenChange);

  const updateOpen = useCallback(
    (value: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(value);
      }
      onOpenChangeRef.current?.(value);
    },
    [controlledOpen, onOpenChangeRef],
  );
  const close = useCallback(() => updateOpen(false), [updateOpen]);

  useDismissableOverlay({
    open,
    onClose: close,
    containerRef,
    triggerRef,
    initialFocusRef: titleRef,
  });

  return (
    <div
      className={styles.container}
      ref={containerRef}
      data-testid="settings-menu-root"
      data-e2e="settings-menu-root"
    >
      <IconButton
        ref={triggerRef}
        data-testid="settings-menu-trigger"
        data-e2e="settings-menu-trigger"
        aria-expanded={open}
        aria-controls="map-settings-menu"
        label={
          open
            ? (labels?.closeLabel ?? "Close map settings")
            : (labels?.openLabel ?? "Map settings")
        }
        onClick={() => updateOpen(!open)}
      >
        {open ? <X aria-hidden="true" /> : <Settings aria-hidden="true" />}
      </IconButton>
      {open ? (
        <section
          id="map-settings-menu"
          className={styles.menu}
          aria-labelledby="map-settings-menu-title"
          data-testid="settings-menu-content"
          data-e2e="settings-menu-content"
        >
          <h2
            id="map-settings-menu-title"
            className={styles.title}
            ref={titleRef}
            tabIndex={-1}
          >
            {labels?.title ?? "Map settings"}
          </h2>
          {showBasemap ? (
            <>
              <BasemapToggle
                basemap={basemap}
                onChange={onBasemapChange}
                label={labels?.basemapLabel}
                optionAriaLabel={labels?.basemapOptionAriaLabel}
              />
              <p
                className={styles.basemapHint}
                data-testid="settings-basemap-hint"
                aria-live="polite"
              >
                {getBasemapDefinition(basemap).description}
              </p>
            </>
          ) : null}
          <ThemeToggle
            preference={themePreference}
            onChange={onThemePreferenceChange}
            label={labels?.themeLabel}
            optionLabels={labels?.themeOptionLabels}
          />
          {children}
        </section>
      ) : null}
    </div>
  );
}
