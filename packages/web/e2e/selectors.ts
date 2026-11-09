/**
 * `data-testid` values used across the Playwright suite, mirroring the
 * `data-testid` attributes rendered by the app's own components; keeping
 * them in one place means a renamed test id only needs updating here.
 */
export const E2E = {
  panelToggle: "panel-toggle",
  panelContainer: "panel-container",
  panelSheetHandle: "panel-sheet-handle",
  panelViewport: "panel-viewport",
  legendChip: "active-legend-chip",
  settingsMenuTrigger: "settings-menu-trigger",
  languageToggle: "language",
  mapView: "map-view",
  locationSearchInput: "location-search-input",
  locationSearchResults: "location-search-results",
  locationSearchRetry: "location-search-retry",
  basemapOption: {
    positron: "basemap-option-positron",
    liberty: "basemap-option-liberty",
    dark: "basemap-option-dark",
    satellite: "basemap-option-satellite",
    topo: "basemap-option-topo",
  },
  themeOption: {
    system: "theme-option-system",
    light: "theme-option-light",
    dark: "theme-option-dark",
  },
  locationContextMenu: "location-context-menu",
  measurement: {
    toggle: "measurement-control-toggle",
    panel: "measurement-control-panel",
    close: "measurement-control-close",
    hint: "measurement-control-hint",
    result: "measurement-control-result",
    clear: "measurement-control-clear",
    modeDistance: "measurement-control-mode-option-distance",
    modeArea: "measurement-control-mode-option-area",
  },
} as const;
