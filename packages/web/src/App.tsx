import type {
  DomainConfig,
  DomainStory as DomainStoryContent,
  Layer,
} from "@karta/core";
import {
  BasemapToggle,
  ControlButton,
  createNominatimGeocoderProvider,
  DomainProvider,
  FeatureBrowser,
  IconButton,
  Legend,
  LocationSearchControl,
  type LocationSearchResult,
  type MeasurementMode,
  type SelectableFeatureSearchEntry,
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
import { Layers, Settings, X } from "lucide-react";
import {
  type AnimationEvent,
  type KeyboardEvent,
  lazy,
  memo,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as styles from "./App.css";
import { DomainStory } from "./components/DomainStory/DomainStory";
import { LanguageToggle } from "./components/LanguageToggle/LanguageToggle";
import { LayerToggles } from "./components/LayerToggles/LayerToggles";
import { PrivacyLink } from "./components/PrivacyLink/PrivacyLink";
import { useMapModelContextTools } from "./hooks/useMapModelContextTools";
import { useMapPermalink } from "./hooks/useMapPermalink";
import { useSheetFocusTrap } from "./hooks/useSheetFocusTrap";
import { useSheetGesture } from "./hooks/useSheetGesture";
import { useTownshipData } from "./hooks/useTownshipData";
import { getLayerGroups, getLayers, getStory } from "./layers/registry";
import { m } from "./paraglide/messages.js";
import {
  type MapSurface,
  type PanelView,
  useMapUiStore,
} from "./stores/useMapUiStore";

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

/**
 * Mainland South Africa's approximate extent. Used both to sanity-check
 * location search results (see `isWithinSearchCoverage`) and, passed
 * directly as `MapView`'s `bounds` prop, as the map's initial viewport; the
 * mapped data itself only covers Gauteng and City of Cape Town (see
 * `@karta/app`'s `REGIONS`), but the basemap and search cover the whole
 * country, so the map opens framing all of it rather than just the mapped
 * regions.
 */
const SEARCH_COVERAGE_BOUNDS: LatLngBoundsTuple = [
  [-34.84, 16.45],
  [-22.13, 32.95],
];

/**
 * This app's own `LocationSearchControl` provider: Nominatim biased toward
 * South Africa, matching `SEARCH_COVERAGE_BOUNDS` above. `@karta/map`'s
 * default `nominatimGeocoderProvider` has no such bias, since a domain-
 * agnostic SDK component can't assume any host's coverage area; a search
 * for a common place name would otherwise rank same-named places elsewhere
 * in the world ahead of the South African one this app actually cares about.
 */
const locationSearchProvider = createNominatimGeocoderProvider({
  countryCodes: "za",
});

/**
 * Whether `location` falls within `SEARCH_COVERAGE_BOUNDS`.
 * @remarks Nominatim searches the whole world, so a query can resolve to a
 *   place far outside South Africa entirely; flying the map there would just
 *   show an empty basemap with no explanation. The mapped data itself only
 *   covers Gauteng and City of Cape Town, but the basemap and search cover
 *   the whole country.
 */
function isWithinSearchCoverage(location: LocationSearchResult): boolean {
  const [[south, west], [north, east]] = SEARCH_COVERAGE_BOUNDS;
  return (
    location.latitude >= south &&
    location.latitude <= north &&
    location.longitude >= west &&
    location.longitude <= east
  );
}

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
  panelView: PanelView;
  basemap: string;
  onBasemapChange: (basemap: string) => void;
  visibleLayerIds: string[];
  onToggle: (id: string) => void;
  failedLayerIds: string[];
  story: DomainStoryContent | undefined;
  selectableFeatures: SelectableFeatureSearchEntry[];
  selectedFeatureId: string | null;
  onSelectFeature: (featureId: string) => void;
  opacityByLayer: Record<string, number>;
  onOpacityChange: (id: string, opacity: number) => void;
}

/** Renders a feature's available properties without assuming a domain schema. */
function FeatureDetails({
  properties,
}: {
  properties: object | null | undefined;
}) {
  const featureProperties = properties as
    | Record<string, unknown>
    | null
    | undefined;
  const attributes = Object.entries(featureProperties ?? {}).filter(
    ([key]) => key !== "id" && key !== "name",
  );
  const title =
    typeof featureProperties?.name === "string"
      ? featureProperties.name
      : m.feature_details_title();

  return (
    <section
      className={styles.section}
      data-testid="feature-details"
      data-e2e="feature-details"
    >
      <h2 id="map-panel-heading" className={styles.sectionTitle}>
        {title}
      </h2>
      {attributes.length > 0 ? (
        <dl className={styles.featureAttributes}>
          {attributes.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                {value === null || value === undefined
                  ? "-"
                  : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * Renders the info panel's active view: layer toggles, the domain's story
 * copy, or the selectable-feature browser.
 * @remarks Memoized like `LayerToggles`, its own child here; `App`
 *   re-renders on every unrelated state change (e.g. the mobile bottom-sheet
 *   drag gesture's per-frame offset), and none of that should force this
 *   panel back through reconciliation.
 */
const PanelViewContent = memo(function PanelViewContent({
  panelView,
  basemap,
  onBasemapChange,
  visibleLayerIds,
  onToggle,
  failedLayerIds,
  story,
  selectableFeatures,
  selectedFeatureId,
  opacityByLayer,
  onOpacityChange,
  onSelectFeature,
}: PanelViewContentProps) {
  let title: string;
  let body: ReactNode;
  if (panelView === "story" && story) {
    title = story.title;
    body = <DomainStory story={story} />;
  } else if (panelView === "browser") {
    title = m.panel_tab_browse();
    body = (
      <FeatureBrowser
        features={selectableFeatures}
        selectedFeatureId={selectedFeatureId}
        onSelect={onSelectFeature}
        filterLabel={m.feature_browser_filter_label()}
        filterPlaceholder={m.feature_browser_filter_placeholder()}
        emptyMessage={m.search_no_results()}
      />
    );
  } else {
    title = m.panel_tab_layers();
    body = (
      <>
        <BasemapToggle
          basemap={basemap}
          onChange={onBasemapChange}
          label={m.settings_basemap_label()}
          optionAriaLabel={(label) => m.basemap_option_aria_label({ label })}
        />
        <LayerToggles
          visibleLayerIds={visibleLayerIds}
          onToggle={onToggle}
          opacityByLayer={opacityByLayer}
          onOpacityChange={onOpacityChange}
          failedLayerIds={failedLayerIds}
        />
      </>
    );
  }
  return (
    <section className={styles.section}>
      <h2 id="map-panel-heading" className={styles.sectionTitle}>
        {title}
      </h2>
      {body}
    </section>
  );
});

/**
 * The reference app's root shell: fetches and merges every configured
 * region's township choropleth data (via `buildRegionDataUrls`; only
 * Gauteng's is actually published today), wraps the render tree in a
 * `DomainProvider` for `spatial-apartheid-legacy`, and renders the map
 * alongside the desktop/mobile info panel and its settings menu.
 * @remarks That township fetch deliberately waits for `MapView`'s `onReady`
 *   (tracked as `mapReady`) rather than starting at mount. Downloading,
 *   validating and handing Leaflet ~2,500 polygons is seconds of
 *   main-thread work on a mid-range phone, and none of it can be drawn
 *   before the map exists; started at mount it simply ran in front of the
 *   map's own first paint and delayed it by all of that. The retry path
 *   (`loadAttempt`) still works unchanged, since the map stays ready.
 *   The info panel shows layer toggles, plus a Story tab reading its
 *   copy from the domain's `story` (via `getStory()`) whenever the active
 *   domain defines one, plus a Browse tab listing every selectable feature
 *   (grouped by layer, via `FeatureBrowser`) whenever the active domain
 *   declares at least one `interaction.selectable` layer; a domain that
 *   omits `story` and defines no selectable layer gets no tab UI at all,
 *   matching today's single-view panel. `domain`/`panelViews`/`panelLabels`
 *   are computed inside the component body, not at module scope: their
 *   content is locale-dependent (`getLayers()`/`getLayerGroups()`/`getStory()`
 *   and the `m.panel_tab_*()` calls all read the current request's locale),
 *   and Cloudflare Workers reuse isolates across requests; a module-scope
 *   value would freeze in whichever locale first touched that isolate
 *   instead of reflecting each request's own. `domain` and `panelViews` are
 *   both wrapped in `useMemo` for referential stability across re-renders
 *   (matching `DomainProvider`'s own internal memoization); `panelLabels` is
 *   cheap enough to recompute every render.
 *   Also owns the mobile bottom-sheet drag/swipe gesture state (pointer
 *   sampling, velocity-based snap projection) in addition to layout state
 *   from `useMapUiStore`. Swiping down from the sheet's medium height closes
 *   it entirely: `closePanel` plays an exit animation and `finishClose`
 *   (unmounting the panel from the a11y tree) fires from that animation's
 *   `animationend`, so the CSS duration in App.css.ts stays the single
 *   source of truth; except under `prefers-reduced-motion`/desktop, where
 *   no animation plays and `closePanel` calls `finishClose` immediately.
 *   `useMapModelContextTools` registers this app's layer/search/basemap/theme/
 *   story/measurement capabilities as WebMCP tools; `handleLocationSelect` is
 *   shared between `LocationSearchControl`'s `onLocationSelect` and that
 *   hook's `search-map-location` tool, so a human picking a result and an
 *   agent calling the tool fly the map the same way.
 *   `handleRequestMeasurement` plays the same role for `measure-distance`/
 *   `measure-area`: it stamps a fresh `token` into `measurementRequest` state
 *   (mirroring `focusLocationTarget`) and passes it straight through to
 *   `MapView`'s own `measurementRequest` prop, so a geocoded measurement
 *   plots on the same on-screen tool a human's clicks would drive.
 *   `useMapPermalink` restores
 *   layer/basemap/panel/feature state from the URL on load and keeps the
 *   URL in sync afterwards, so the address bar is always a shareable link
 *   to the current view; it defers applying a shared `selectedFeatureId`
 *   until `townships` has data, since Leaflet has nothing to select before then.
 *   `!isDesktopViewport && panelOpen` is passed to `MapView` as
 *   `measurementPanelOpen`, and `closePanel` as `onMeasurementPanelClose`,
 *   so the measurement tool collapses to its idle toggle instead of
 *   competing with the mobile Explore sheet for the same sliver of screen;
 * tapping that toggle while the sheet is open closes the sheet (via
 *   the same `closePanel` used by Escape/outside-click) rather than
 *   disappearing outright, so there's always a visible way back to a
 *   measurement in progress. Gated to mobile because the desktop sidebar is
 *   open by default (see the hydration effect below); without that gate
 *   the measurement tool could never actually open on desktop, since its
 *   host panel is "open" from the moment the page loads.
 *   `MobileLegend`'s own `panelOpen` prop and the `.app` element's
 *   `data-panel-open` attribute are driven by the derived `panelVisuallyOpen`
 *   below, not raw `panelOpen`; see that constant's own doc comment for why.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The shell coordinates mutually exclusive map surfaces and their shared controls.
export function App() {
  const [hydrated, setHydrated] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [basemapVisuallyReady, setBasemapVisuallyReady] = useState(false);
  const [failedLayerIds, setFailedLayerIds] = useState<string[]>([]);
  const [selectableFeatures, setSelectableFeatures] = useState<
    SelectableFeatureSearchEntry[]
  >([]);
  const [mapCoordinates, setMapCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [mobileSheetClosing, setMobileSheetClosing] = useState(false);
  const [focusLocationTarget, setFocusLocationTarget] =
    useState<FocusLocationTarget | null>(null);
  const [measurementRequest, setMeasurementRequest] =
    useState<MeasurementRequest | null>(null);
  const [outOfCoverageLocationLabel, setOutOfCoverageLocationLabel] = useState<
    string | null
  >(null);
  const visibleLayerIds = useMapUiStore((state) => state.visibleLayerIds);
  const opacityByLayer = useMapUiStore((state) => state.opacityByLayer);
  const basemap = useMapUiStore((state) => state.basemap);
  const activeSurface = useMapUiStore((state) => state.activeSurface);
  const sheetDetent = useMapUiStore((state) => state.sheetDetent);
  const panelOpen =
    activeSurface === "explore" ||
    activeSurface === "feature" ||
    activeSurface === "legend" ||
    activeSurface === "settings";
  const settingsOpen = activeSurface === "settings";
  const panelView = useMapUiStore((state) => state.panelView);
  const selectedFeatureId = useMapUiStore((state) => state.selectedFeatureId);
  const toggleLayer = useMapUiStore((state) => state.toggleLayer);
  const setLayerOpacity = useMapUiStore((state) => state.setLayerOpacity);
  const setBasemap = useMapUiStore((state) => state.setBasemap);
  const setActiveSurface = useMapUiStore((state) => state.setActiveSurface);
  const setSheetDetent = useMapUiStore((state) => state.setSheetDetent);
  const setPanelView = useMapUiStore((state) => state.setPanelView);
  const setSelectedFeatureId = useMapUiStore(
    (state) => state.setSelectedFeatureId,
  );
  const themePreference = useThemePreference();
  const domain = useMemo<DomainConfig>(
    () => ({
      layers: getLayers(),
      layerGroups: getLayerGroups(),
      story: getStory(),
    }),
    [],
  );
  const story = domain.story;
  const activeLayers = useMemo(
    () => domain.layers.filter((layer) => visibleLayerIds.includes(layer.id)),
    [domain.layers, visibleLayerIds],
  );
  const hasVisibleChoropleth = useMemo(
    () => activeLayers.some((layer) => layer.geometryKind === "choropleth"),
    [activeLayers],
  );
  const {
    townships,
    townshipAreas,
    dataError,
    retry: retryTownshipData,
  } = useTownshipData(mapReady, hasVisibleChoropleth);
  const selectedFeature = useMemo(
    () =>
      townships.find((feature) => feature.properties.id === selectedFeatureId),
    [selectedFeatureId, townships],
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
  /**
   * Localized copy forwarded to both `DesktopLegend`/`MobileLegend`'s
   * internal `Legend`, computed fresh per render for the same per-request
   * locale reason as `domain` above.
   */
  const legendLabels = useMemo(
    () => ({
      noDataLabel: m.legend_no_data(),
      transitRoutesLabel: m.legend_transit_routes(),
      transitColorsAriaLabel: m.legend_transit_colors_aria_label(),
      emptyMessage: m.legend_empty(),
      lineAndStationsNote: m.legend_line_and_stations_note(),
      routeOnlyNote: m.legend_route_only_note(),
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
  const formatSelectionAnnouncement = useCallback(
    (label: string) => m.map_selection_announcement({ label }),
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
  const handleFeatureSelect = useCallback(
    (featureId: string) => {
      setSelectedFeatureId(featureId);
      setSheetDetent("half");
      openSurface("feature");
    },
    [openSurface, setSelectedFeatureId, setSheetDetent],
  );
  /**
   * Whether the active domain declares any `interaction.selectable` layer at
   * all; a structural fact about the domain's own layer catalogue, checked
   * the same way `MapView`'s own `selectableSearchEntries` does, not derived
   * from whether any such layer's data has actually loaded yet. Gating the
   * "Browse" tab on this (rather than on `selectableFeatures.length`, which
   * starts empty and only fills in once `MapView` reports data) keeps the
   * tab list itself deterministic from first render, matching how the
   * "Story" tab is gated on `domain.story` rather than on that copy having
   * rendered; the tab exists as soon as the domain says it should, and the
   * browser's own content (not the tab's presence) is what reflects data
   * still loading.
   */
  const hasSelectableLayers = useMemo(
    () => domain.layers.some((layer) => layer.interaction?.selectable),
    [domain.layers],
  );
  /**
   * Memoised (not just `story`/`hasSelectableLayers`-derived inline) so this
   * array keeps one identity across renders unless those inputs themselves
   * change; `handlePanelToggle`/`handleTabKeyDown` and the tab list render
   * both index into it directly, and a fresh array literal every render
   * would otherwise be reallocated for no reason on every unrelated render.
   */
  const panelViews = useMemo<readonly PanelView[]>(() => {
    const views: PanelView[] = ["layers"];
    if (story) {
      views.push("story");
    }
    if (hasSelectableLayers) {
      views.push("browser");
    }
    return views;
  }, [story, hasSelectableLayers]);
  const panelLabels: Record<PanelView, string> = {
    layers: m.panel_tab_layers(),
    story: m.panel_tab_story(),
    browser: m.panel_tab_browse(),
  };
  const isDesktopViewport = useIsDesktopViewport();
  const panelRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
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
    if (!isWithinSearchCoverage(location)) {
      setOutOfCoverageLocationLabel(location.label);
      return m.location_out_of_coverage({ location: location.label });
    }
    setOutOfCoverageLocationLabel(null);
    setSelectedFeatureId(null);
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
    story,
    onShowStory: () => {
      setPanelView("story");
      setSheetDetent("half");
      openSurface("explore");
    },
    onRequestMeasurement: handleRequestMeasurement,
  });

  const townshipFeatureIds = useMemo(
    () => new Set(townships.map((feature) => feature.properties.id)),
    [townships],
  );

  useMapPermalink({
    dataReady: townships.length > 0,
    knownFeatureIds: townshipFeatureIds,
  });

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
    if (activeSurface === "feature") {
      setSelectedFeatureId(null);
    }
    setActiveSurface(null);
    requestAnimationFrame(() => surfaceTriggerRef.current?.focus());
  }, [activeSurface, setActiveSurface, setSelectedFeatureId]);

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
      const activeTabIndex = panelViews.indexOf(panelView);
      (tabRefs.current[activeTabIndex] ?? singleViewRef.current)?.focus();
    });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = panelViews.indexOf(panelView);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % panelViews.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + panelViews.length) % panelViews.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = panelViews.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextView = panelViews[nextIndex];
    /* v8 ignore next 3 -- unreachable: nextIndex is always derived via modulo of panelViews.length or clamped to its bounds above, so it always indexes an existing entry */
    if (!nextView) {
      return;
    }
    setPanelView(nextView);
    tabRefs.current[nextIndex]?.focus();
  }

  const panelViewContent = (
    <PanelViewContent
      panelView={panelView}
      basemap={basemap}
      onBasemapChange={setBasemap}
      visibleLayerIds={visibleLayerIds}
      opacityByLayer={opacityByLayer}
      onToggle={toggleLayer}
      onOpacityChange={setLayerOpacity}
      failedLayerIds={failedLayerIds}
      story={story}
      selectableFeatures={selectableFeatures}
      selectedFeatureId={selectedFeatureId}
      onSelectFeature={handleFeatureSelect}
    />
  );
  const activePanelContent =
    activeSurface === "feature" ? (
      <FeatureDetails properties={selectedFeature?.properties} />
    ) : activeSurface === "legend" ? (
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
                bounds={SEARCH_COVERAGE_BOUNDS}
                ariaLabel={m.map_aria_label()}
                areas={townships}
                areaBoundaries={townshipAreas}
                visibleLayerIds={visibleLayerIds}
                layerOpacity={opacityByLayer}
                basemap={basemap}
                selectedFeatureId={selectedFeatureId}
                focusLocationTarget={focusLocationTarget}
                onCoordinatesChange={setMapCoordinates}
                onFeatureSelect={handleFeatureSelect}
                onSelectableFeaturesChange={setSelectableFeatures}
                onLayerDataError={setFailedLayerIds}
                onReady={handleMapReady}
                onBasemapReady={handleBasemapReady}
                onBasemapError={() => setBasemap("topo")}
                formatSelectionAnnouncement={formatSelectionAnnouncement}
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
          {dataError ? (
            <div
              className={styles.dataError}
              role="alert"
              data-testid="data-load-error"
              data-e2e="data-load-error"
            >
              <p>{m.data_load_error()}</p>
              <button
                type="button"
                data-testid="retry-data-load"
                data-e2e="retry-data-load"
                onClick={retryTownshipData}
              >
                {m.retry()}
              </button>
            </div>
          ) : null}
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
            onQueryChange={() => setOutOfCoverageLocationLabel(null)}
            selectableFeatures={selectableFeatures}
            onFeatureSelect={handleFeatureSelect}
          />
          {outOfCoverageLocationLabel ? (
            <output
              className={styles.outOfCoverage}
              data-testid="location-out-of-coverage"
              data-e2e="location-out-of-coverage"
            >
              {m.location_out_of_coverage({
                location: outOfCoverageLocationLabel,
              })}
            </output>
          ) : null}
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

        {legendChipVisible ? (
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
          {activeSurface === "explore" && panelViews.length > 1 ? (
            <>
              <div
                className={styles.panelTabs}
                role="tablist"
                aria-label={m.panel_tablist_aria_label()}
                data-testid="panel-tablist"
                data-e2e="panel-tablist"
              >
                {panelViews.map((view, index) => (
                  <button
                    key={view}
                    type="button"
                    data-testid={`panel-tab-${view}`}
                    data-e2e={`panel-tab-${view}`}
                    ref={(element) => {
                      tabRefs.current[index] = element;
                    }}
                    id={`panel-tab-${view}`}
                    role="tab"
                    tabIndex={panelView === view ? 0 : -1}
                    aria-selected={panelView === view}
                    aria-controls={`panel-view-${view}`}
                    className={styles.panelTab}
                    onClick={() => setPanelView(view)}
                    onKeyDown={handleTabKeyDown}
                  >
                    {panelLabels[view]}
                  </button>
                ))}
              </div>
              <div
                {...PANEL_VIEWPORT_PROPS}
                id={`panel-view-${panelView}`}
                role="tabpanel"
                aria-labelledby={`panel-tab-${panelView}`}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA APG recommends tabindex=0 on a tabpanel so keyboard users can reach panels (like Story) whose content has no focusable element of its own
                tabIndex={0}
              >
                {activePanelContent}
              </div>
            </>
          ) : (
            <div {...PANEL_VIEWPORT_PROPS} ref={singleViewRef} tabIndex={-1}>
              {activePanelContent}
            </div>
          )}
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
