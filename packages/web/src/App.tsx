import type { DomainConfig, Layer } from "@karta/core";
import {
  BasemapToggle,
  ControlButton,
  createNominatimGeocoderProvider,
  DomainProvider,
  IconButton,
  Legend,
  LocationSearchControl,
  type LocationSearchResult,
  type MeasurementMode,
  ThemeToggle,
  useDismissableOverlay,
} from "@karta/map";
import {
  setThemePreference,
  useDeferredReadyAttribute,
  useIsDesktopViewport,
  useThemePreference,
} from "@karta/react";
import { setElementVars } from "@vanilla-extract/dynamic";
import clsx from "clsx";
import type { Feature } from "geojson";
import { Layers, Settings, X } from "lucide-react";
import {
  type AnimationEvent,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as styles from "./App.css";
import { LanguageToggle } from "./components/LanguageToggle/LanguageToggle";
import { LayerToggles } from "./components/LayerToggles/LayerToggles";
import { PrivacyLink } from "./components/PrivacyLink/PrivacyLink";
import { useMapModelContextTools } from "./hooks/useMapModelContextTools";
import { useMapPermalink } from "./hooks/useMapPermalink";
import { useSheetFocusTrap } from "./hooks/useSheetFocusTrap";
import { useSheetGesture } from "./hooks/useSheetGesture";
import { getLayerGroups, getLayers } from "./layers/registry";
import { m } from "./paraglide/messages.js";
import { type MapSurface, useMapUiStore } from "./stores/useMapUiStore";

// Leaflet's stylesheet loads with the map chunk, so routes without a map
// (such as /privacy) don't block on it.
const MapView = lazy(async () => {
  const [{ MapView }] = await Promise.all([
    import("@karta/map/MapView"),
    import("leaflet/dist/leaflet.css"),
  ]);
  return { default: MapView };
});

/** A Leaflet-style `[[south, west], [north, east]]` bounding rectangle. */
type LatLngBoundsTuple = [[number, number], [number, number]];

/** Initial viewport only. Search and map navigation are unrestricted. */
const INITIAL_BOUNDS: LatLngBoundsTuple = [
  [-34.84, 16.45],
  [-22.13, 32.95],
];
const EMPTY_FEATURES: Feature[] = [];

/** Shared, swappable geocoder for search and reverse geocoding. */
const locationSearchProvider = createNominatimGeocoderProvider();

const PANEL_VIEWPORT_PROPS = {
  className: styles.panelViewport,
  "data-testid": "panel-viewport",
  "data-e2e": "panel-viewport",
} as const;

interface FocusLocationTarget {
  token: number;
  location: LocationSearchResult;
}

/** A WebMCP-driven request to plot a measurement, mirroring `MapView`'s own `measurementRequest` prop. */
interface MeasurementRequest {
  token: number;
  mode: MeasurementMode;
  points: { lat: number; lng: number }[];
}

/** Converts a boolean into the `"true"`/`"false"` string Karta's `data-*` boolean attributes (and their CSS/e2e selectors) expect. */
function toBoolAttr(value: boolean): "true" | "false" {
  return value ? "true" : "false";
}

/** Reads the configured colour ramp for a layer without substituting UI colours. */
function getLayerRampColors(layer: Layer | undefined): string[] {
  if (!layer) {
    return [];
  }
  if (layer.style.kind === "choropleth") {
    return layer.style.buckets.map((bucket) => bucket.color);
  }
  if (layer.style.kind === "line") {
    return [layer.style.color];
  }
  return [];
}

interface PanelViewContentProps {
  basemap: string;
  onBasemapChange: (basemap: string) => void;
  visibleLayerIds: string[];
  onToggle: (id: string) => void;
  failedLayerIds: string[];
  hasLayers: boolean;
  opacityByLayer: Record<string, number>;
  onOpacityChange: (id: string, opacity: number) => void;
}

/** Keeps the map controls stable during sheet gestures. */
const PanelViewContent = memo(function PanelViewContent({
  basemap,
  onBasemapChange,
  visibleLayerIds,
  onToggle,
  failedLayerIds,
  hasLayers,
  opacityByLayer,
  onOpacityChange,
}: PanelViewContentProps) {
  return (
    <section className={styles.section}>
      <h2 id="map-panel-heading" className={styles.sectionTitle}>
        {m.map_controls_title()}
      </h2>
      <BasemapToggle
        basemap={basemap}
        onChange={onBasemapChange}
        label={m.settings_basemap_label()}
        optionAriaLabel={(label) => m.basemap_option_aria_label({ label })}
      />
      {hasLayers ? (
        <LayerToggles
          visibleLayerIds={visibleLayerIds}
          onToggle={onToggle}
          opacityByLayer={opacityByLayer}
          onOpacityChange={onOpacityChange}
          failedLayerIds={failedLayerIds}
        />
      ) : null}
    </section>
  );
});

/** Map shell with a configurable layer catalogue and mutually exclusive control surfaces. */
export function App() {
  const [hydrated, setHydrated] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [basemapVisuallyReady, setBasemapVisuallyReady] = useState(false);
  const [failedLayerIds, setFailedLayerIds] = useState<string[]>([]);
  const [mapCoordinates, setMapCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [mobileSheetClosing, setMobileSheetClosing] = useState(false);
  const [focusLocationTarget, setFocusLocationTarget] =
    useState<FocusLocationTarget | null>(null);
  const [measurementRequest, setMeasurementRequest] =
    useState<MeasurementRequest | null>(null);
  const visibleLayerIds = useMapUiStore((state) => state.visibleLayerIds);
  const opacityByLayer = useMapUiStore((state) => state.opacityByLayer);
  const basemap = useMapUiStore((state) => state.basemap);
  const activeSurface = useMapUiStore((state) => state.activeSurface);
  const sheetDetent = useMapUiStore((state) => state.sheetDetent);
  const panelOpen =
    activeSurface === "explore" ||
    activeSurface === "legend" ||
    activeSurface === "settings";
  const settingsOpen = activeSurface === "settings";
  const toggleLayer = useMapUiStore((state) => state.toggleLayer);
  const setLayerOpacity = useMapUiStore((state) => state.setLayerOpacity);
  const setBasemap = useMapUiStore((state) => state.setBasemap);
  const setActiveSurface = useMapUiStore((state) => state.setActiveSurface);
  const setSheetDetent = useMapUiStore((state) => state.setSheetDetent);
  const themePreference = useThemePreference();
  const domain = useMemo<DomainConfig>(
    () => ({
      layers: getLayers(),
      layerGroups: getLayerGroups(),
    }),
    [],
  );
  const activeLayers = useMemo(
    () => domain.layers.filter((layer) => visibleLayerIds.includes(layer.id)),
    [domain.layers, visibleLayerIds],
  );
  const activeLegendLayer = activeLayers[0];
  const activeLegendRamp = useMemo(
    () => getLayerRampColors(activeLegendLayer),
    [activeLegendLayer],
  );
  const legendRampRef = useRef<HTMLSpanElement>(null);
  const panelTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const surfaceTriggerRef = useRef<HTMLButtonElement>(null);
  const legendChipVisible = Boolean(
    activeLegendLayer && !(panelOpen && !mobileSheetClosing),
  );
  /** Resolve localised copy inside render so SSR requests cannot share a frozen locale. */
  const legendLabels = useMemo(
    () => ({
      noDataLabel: m.legend_no_data(),
      lineLayersLabel: m.legend_line_layers(),
      lineColorsAriaLabel: m.legend_line_colors_aria_label(),
      emptyMessage: m.legend_empty(),
      lineAndPointsNote: m.legend_line_and_points_note(),
      lineOnlyNote: m.legend_line_only_note(),
      formatActiveAriaLabel: (label: string) =>
        m.legend_active_aria_label({ label }),
    }),
    [],
  );
  /** Localized copy forwarded to `MapView`'s internal `LocationContextMenu`, memoized for the same reason as `legendLabels`. */
  const locationContextMenuLabels = useMemo(
    () => ({
      ariaLabel: m.location_context_menu_aria_label(),
      searchHereLabel: m.location_context_menu_search_here(),
      loadingLabel: m.location_context_menu_loading(),
      failedLabel: m.location_context_menu_failed(),
      noAddressLabel: m.location_context_menu_no_address(),
      retryLabel: m.retry(),
    }),
    [],
  );
  const settingsLabels = useMemo(
    () => ({
      openLabel: m.settings_open(),
      closeLabel: m.settings_close(),
      title: m.settings_title(),
      basemapLabel: m.settings_basemap_label(),
      basemapOptionAriaLabel: (label: string) =>
        m.basemap_option_aria_label({ label }),
      themeLabel: m.settings_theme_label(),
      themeOptionLabels: {
        system: {
          label: m.theme_system(),
          ariaLabel: m.theme_system_aria_label(),
        },
        light: {
          label: m.theme_light(),
          ariaLabel: m.theme_light_aria_label(),
        },
        dark: {
          label: m.theme_dark(),
          ariaLabel: m.theme_dark_aria_label(),
        },
      },
      showBasemap: false,
    }),
    [],
  );
  /** Localized copy forwarded to `MapView`'s internal `MeasurementControl`, memoized for the same reason as `legendLabels`. */
  const measurementLabels = useMemo(
    () => ({
      toggleLabel: m.measurement_toggle(),
      backToMapLabel: m.measurement_back_to_map(),
      ariaLabel: m.measurement_aria_label(),
      title: m.measurement_title(),
      stopLabel: m.measurement_stop(),
      modeLabel: m.measurement_mode_label(),
      distanceModeLabel: m.measurement_mode_distance(),
      areaModeLabel: m.measurement_mode_area(),
      hint: m.measurement_hint(),
      clearLabel: m.measurement_clear(),
    }),
    [],
  );
  const openSurface = useCallback(
    (
      surface: Exclude<MapSurface, null>,
      trigger: HTMLButtonElement | null = panelTriggerRef.current,
    ) => {
      setMobileSheetClosing(false);
      surfaceTriggerRef.current = trigger;
      setActiveSurface(surface);
    },
    [setActiveSurface],
  );
  useEffect(() => {
    const element = legendRampRef.current;
    if (!element || !legendChipVisible) {
      return;
    }
    if (activeLegendRamp.length === 0) {
      element.style.removeProperty(styles.legendRampBackground);
      return;
    }
    const stops = activeLegendRamp
      .map((color, index) => {
        const start = (index / activeLegendRamp.length) * 100;
        const end = ((index + 1) / activeLegendRamp.length) * 100;
        return `${color} ${start}% ${end}%`;
      })
      .join(", ");
    setElementVars(element, {
      [styles.legendRampBackground]: `linear-gradient(90deg, ${stops})`,
    });
  }, [activeLegendRamp, legendChipVisible]);
  const isDesktopViewport = useIsDesktopViewport();
  const panelRef = useRef<HTMLElement>(null);
  const singleViewRef = useRef<HTMLDivElement>(null);
  const {
    ref: appRef,
    markNotReady: markSheetEntranceNotReady,
    markReadyAfterPaint: markSheetEntranceReadyAfterPaint,
  } = useDeferredReadyAttribute<HTMLDivElement>("data-sheet-entrance-ready");
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!panelOpen) {
      setSheetDetent("half");
    }
  }, [panelOpen, setSheetDetent]);
  /**
   * `panelOpen` itself only flips to `false` once the mobile sheet's exit
   * animation has fully finished (see `finishClose`), so anything reactive
   * to raw `panelOpen` (the legend trigger's climb, the panel toggle's
   * collapse to a small icon button) stayed in its "open" position for the
   * whole 280ms the sheet was already sliding away, then snapped back
   * down afterwards instead of moving with it. This flips the moment the
   * close animation *starts* instead, so those controls animate back in
   * step with the sheet's own slide-out rather than a beat behind it.
   */
  const panelVisuallyOpen = panelOpen && !mobileSheetClosing;
  /**
   * Applies the live drag offset to the panel element imperatively, via
   * `setElementVars`' `style.setProperty()`, rather than through a React
   * `style` prop. A `style` prop would render as a literal `style="..."`
   * attribute in the server-rendered HTML; parsed by the browser before
   * any script runs, which this app's strict `style-src` (no
   * `'unsafe-inline'`) refuses. A CSSOM mutation isn't subject to that
   * restriction, so setting it here, once mounted, keeps the panel
   * draggable under that CSP with no attribute in the initial markup.
   */
  const handleMapReady = useCallback(() => setMapReady(true), []);
  const handleBasemapReady = useCallback(
    () => setBasemapVisuallyReady(true),
    [],
  );

  function handleLocationSelect(location: LocationSearchResult): string {
    setFocusLocationTarget({ token: Date.now(), location });
    return m.webmcp_search_location_flew_to({ location: location.label });
  }

  function handleRequestMeasurement(
    mode: MeasurementMode,
    points: { lat: number; lng: number }[],
  ) {
    openSurface("measure");
    setMeasurementRequest({ token: Date.now(), mode, points });
  }

  useMapModelContextTools({
    onLocationSelect: handleLocationSelect,
    onRequestMeasurement: handleRequestMeasurement,
  });

  useMapPermalink();

  /**
   * Memoised (along with `closePanel` below) so `useDismissableOverlay`'s
   * effect (which lists `onClose` as a dependency) only re-subscribes
   * its document-level listeners when what actually changed is relevant
   * (`isDesktopViewport`), not on every unrelated render. Left unmemoised,
   * this pair was recreated on every `App` render, including every
   * animation-frame tick of the mobile sheet's own drag gesture.
   */
  const finishClose = useCallback(() => {
    setMobileSheetClosing(false);
    setActiveSurface(null);
    requestAnimationFrame(() => surfaceTriggerRef.current?.focus());
  }, [setActiveSurface]);

  const closePanel = useCallback(() => {
    const playsExitAnimation =
      !isDesktopViewport &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!playsExitAnimation) {
      finishClose();
      return;
    }
    setMobileSheetClosing(true);
  }, [isDesktopViewport, finishClose]);

  const {
    dragOffset,
    dragging: mobileSheetDragging,
    dragDirection: mobileSheetDragDirection,
    onHandleClick: handleSheetHeightToggle,
    onHandlePointerDown: handleSheetHandlePointerDown,
  } = useSheetGesture({
    isDesktopViewport,
    detent: sheetDetent,
    setDetent: setSheetDetent,
    close: closePanel,
  });

  useEffect(() => {
    if (panelRef.current) {
      setElementVars(panelRef.current, {
        [styles.panelDragOffset]: `${dragOffset}px`,
      });
    }
  }, [dragOffset]);

  /**
   * Closes the panel on Escape (from anywhere, matching `SettingsMenu`/
   * `MobileLegend`'s own behaviour) or on an outside pointerdown; but only
   * on mobile, where the panel is a transient bottom sheet covering the map.
   * On desktop it's a persistent sidebar the user is expected to keep open
   * alongside ordinary map interaction, so a stray click on the map itself
   * must not dismiss it the way it would a popover.
   */
  useDismissableOverlay({
    open: panelOpen,
    onClose: closePanel,
    containerRef: panelRef,
    triggerRef: surfaceTriggerRef,
    dismissOnOutsideClick: !isDesktopViewport,
  });

  useSheetFocusTrap(
    panelOpen && !isDesktopViewport && sheetDetent === "full",
    panelRef,
  );

  function handleSheetAnimationEnd(event: AnimationEvent<HTMLElement>) {
    // vanilla-extract hashes @keyframes names, so animationName can't be
    // matched against a literal here; requiring the event to originate on
    // the panel itself (not bubble up from a child like .panelViewport's
    // own entrance animation) is enough, since .panel only ever animates
    // while closing.
    if (mobileSheetClosing && event.target === event.currentTarget) {
      finishClose();
    }
  }

  /**
   * Opening moves focus into the panel (the active tab when tabs are
   * shown, otherwise the single view's own container) mirroring how
   * `finishClose` already returns focus to the trigger on the way out.
   * `hidden` comes off the `<aside>` in the same commit `setPanelOpen(true)`
   * causes, so by the next animation frame the target is focusable, the
   * same assumption `finishClose`'s own `requestAnimationFrame` call makes.
   *
   * `markSheetEntranceNotReady`/`markSheetEntranceReadyAfterPaint` reset and
   * re-arm `data-sheet-entrance-ready` in that same commit; see
   * `useDeferredReadyAttribute`'s own doc comment (`@karta/react`) for why
   * the mobile sheet's own entrance fade (its CSS pauses on that attribute)
   * needs this rather than just starting immediately.
   */
  function handlePanelToggle() {
    if (panelOpen) {
      closePanel();
      return;
    }
    surfaceTriggerRef.current = panelTriggerRef.current;
    setSheetDetent("half");
    markSheetEntranceNotReady();
    openSurface("explore");
    markSheetEntranceReadyAfterPaint();
    requestAnimationFrame(() => {
      singleViewRef.current?.focus();
    });
  }

  const panelViewContent = (
    <PanelViewContent
      basemap={basemap}
      onBasemapChange={setBasemap}
      visibleLayerIds={visibleLayerIds}
      opacityByLayer={opacityByLayer}
      onToggle={toggleLayer}
      onOpacityChange={setLayerOpacity}
      failedLayerIds={failedLayerIds}
      hasLayers={domain.layers.length > 0}
    />
  );
  const activePanelContent =
    activeSurface === "legend" ? (
      <section className={styles.section}>
        <h2 id="map-panel-heading" className={styles.sectionTitle}>
          {m.legend_title()}
        </h2>
        <Legend
          mode="active"
          visibleLayerIds={visibleLayerIds}
          compact
          {...legendLabels}
        />
      </section>
    ) : activeSurface === "settings" ? (
      <section className={styles.section}>
        <h2 id="map-panel-heading" className={styles.sectionTitle}>
          {m.settings_title()}
        </h2>
        <ThemeToggle
          preference={themePreference}
          onChange={setThemePreference}
          label={m.settings_theme_label()}
          optionLabels={settingsLabels.themeOptionLabels}
        />
        <LanguageToggle />
        <PrivacyLink />
      </section>
    ) : (
      panelViewContent
    );

  const panelToggleLabel = panelOpen
    ? m.panel_toggle_close()
    : m.panel_toggle_explore();

  return (
    <DomainProvider domain={domain}>
      <div
        ref={appRef}
        className={styles.app}
        data-panel-open={toBoolAttr(panelVisuallyOpen)}
        data-panel-size={sheetDetent}
        data-panel-dragging={toBoolAttr(mobileSheetDragging)}
        data-panel-drag-direction={mobileSheetDragDirection}
        data-entrance-ready={toBoolAttr(mapReady)}
      >
        <a className={styles.skipLink} href="#map-information">
          {m.skip_to_map_information()}
        </a>

        <header className={styles.visuallyHidden}>
          <h1>{m.app_heading()}</h1>
        </header>

        <main id="map-information" tabIndex={-1}>
          {/*
            Rendered unconditionally (server-rendered, then left mounted
            through hydration and MapView's own lazy-load/mount) rather than
            swapped out via a ternary or Suspense fallback: Chrome stops
            counting an element towards Largest Contentful Paint the moment
            it's removed from the DOM, so a placeholder that gets unmounted
            can never end up being the reported LCP element even if it was
            the largest thing on screen for seconds. `MapView`'s own
            full-viewport container paints over this in normal DOM-order
            stacking once it mounts; `aria-hidden` (not removal) keeps
            screen readers from re-announcing "loading" once the real map
            is ready. Held past `mapReady` (Leaflet's own mount) until
            `basemapVisuallyReady` too -- Leaflet reports ready as soon as it
            has a view, well before a raster basemap's tiles or a vector
            basemap's lazily-loaded MapLibre bundle/style have actually
            painted anything, so hiding on `mapReady` alone swapped this
            placeholder for a blank map that then filled in tile-by-tile.
          */}
          <output
            className={styles.mapLoading}
            aria-hidden={mapReady && basemapVisuallyReady}
          >
            {m.loading_map()}
          </output>
          {hydrated && (
            <Suspense fallback={null}>
              <MapView
                bounds={INITIAL_BOUNDS}
                areas={EMPTY_FEATURES}
                ariaLabel={m.map_aria_label()}
                visibleLayerIds={visibleLayerIds}
                layerOpacity={opacityByLayer}
                basemap={basemap}
                focusLocationTarget={focusLocationTarget}
                onCoordinatesChange={setMapCoordinates}
                onLayerDataError={setFailedLayerIds}
                onReady={handleMapReady}
                onBasemapReady={handleBasemapReady}
                onBasemapError={() => setBasemap("topo")}
                locationContextMenu
                locationContextMenuProvider={locationSearchProvider}
                locationContextMenuLabels={locationContextMenuLabels}
                measurementTool
                measurementLabels={measurementLabels}
                measurementActive={activeSurface === "measure"}
                onMeasurementActiveChange={(active) => {
                  if (active) {
                    openSurface("measure");
                  } else {
                    setActiveSurface(null);
                  }
                }}
                measurementPanelOpen={
                  activeSurface !== null && activeSurface !== "measure"
                }
                onMeasurementPanelClose={() => openSurface("measure")}
                measurementRequest={measurementRequest}
              />
            </Suspense>
          )}
        </main>

        <search
          className={clsx(styles.locationSearchControl, styles.surface)}
          aria-label={m.search_label()}
        >
          <LocationSearchControl
            placeholder={m.search_placeholder()}
            label={m.search_label()}
            ariaLabel={m.search_aria_label()}
            clearButtonLabel={m.search_clear()}
            searchingLabel={m.search_searching()}
            noResultsLabel={m.search_no_results()}
            unavailableMessage={m.search_unavailable()}
            provider={locationSearchProvider}
            onLocationSelect={handleLocationSelect}
          />
        </search>

        {mapCoordinates ? (
          <div
            className={styles.coordinateReadout}
            aria-hidden="true"
            data-testid="map-coordinate-readout"
            data-e2e="map-coordinate-readout"
          >
            {mapCoordinates.latitude.toFixed(4)},{" "}
            {mapCoordinates.longitude.toFixed(4)}
          </div>
        ) : null}

        <ControlButton
          ref={panelTriggerRef}
          className={styles.panelTrigger}
          shape="pill"
          data-testid="panel-toggle"
          data-e2e="panel-toggle"
          aria-expanded={panelOpen}
          aria-controls="map-controls"
          label={panelToggleLabel}
          onClick={handlePanelToggle}
        >
          {panelOpen ? <X aria-hidden="true" /> : <Layers aria-hidden="true" />}
          <span className={styles.panelTriggerLabel} aria-hidden="true">
            {panelToggleLabel}
          </span>
        </ControlButton>

        {legendChipVisible && activeLegendLayer ? (
          <button
            type="button"
            className={styles.legendChip}
            aria-label={`${m.legend_active_aria_label({
              label: activeLegendLayer.label,
            })}${activeLayers.length > 1 ? ` +${activeLayers.length - 1}` : ""}`}
            data-testid="active-legend-chip"
            data-e2e="active-legend-chip"
            onClick={() => {
              setSheetDetent("half");
              openSurface("legend");
            }}
          >
            <span className={styles.legendChipLabel}>
              {activeLegendLayer.label}
              {activeLayers.length > 1 ? ` +${activeLayers.length - 1}` : ""}
            </span>
            <span
              ref={legendRampRef}
              className={styles.legendRamp}
              aria-hidden="true"
            />
          </button>
        ) : null}

        <aside
          id="map-controls"
          role="dialog"
          aria-modal={!isDesktopViewport && sheetDetent === "full"}
          aria-labelledby="map-panel-heading"
          tabIndex={-1}
          ref={panelRef}
          className={clsx(styles.panel, styles.surface)}
          data-testid="panel-container"
          data-e2e="panel-container"
          data-panel-size={sheetDetent}
          data-panel-dragging={toBoolAttr(mobileSheetDragging)}
          data-panel-drag-direction={mobileSheetDragDirection}
          data-panel-closing={toBoolAttr(mobileSheetClosing)}
          hidden={!panelOpen}
          onAnimationEnd={handleSheetAnimationEnd}
        >
          <button
            type="button"
            className={styles.sheetHandleButton}
            data-testid="panel-sheet-handle"
            data-e2e="panel-sheet-handle"
            data-dragging={toBoolAttr(mobileSheetDragging)}
            data-drag-direction={mobileSheetDragDirection}
            aria-pressed={sheetDetent === "full"}
            aria-label={
              sheetDetent === "full"
                ? m.panel_reduce_height()
                : m.panel_expand_height()
            }
            onPointerDown={handleSheetHandlePointerDown}
            onClick={handleSheetHeightToggle}
          >
            <span className={styles.sheetHandle} aria-hidden="true" />
          </button>
          <div {...PANEL_VIEWPORT_PROPS} ref={singleViewRef} tabIndex={-1}>
            {activePanelContent}
          </div>
        </aside>

        <IconButton
          ref={settingsTriggerRef}
          className={styles.settingsControl}
          label={settingsOpen ? m.settings_close() : m.settings_open()}
          aria-expanded={settingsOpen}
          aria-controls="map-controls"
          data-testid="settings-menu-trigger"
          data-e2e="settings-menu-trigger"
          onClick={() => {
            if (settingsOpen) {
              setActiveSurface(null);
              return;
            }
            setSheetDetent("half");
            openSurface("settings", settingsTriggerRef.current);
          }}
        >
          {settingsOpen ? (
            <X aria-hidden="true" />
          ) : (
            <Settings aria-hidden="true" />
          )}
        </IconButton>
      </div>
    </DomainProvider>
  );
}
