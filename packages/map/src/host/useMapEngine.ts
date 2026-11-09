import {
  type BasemapDefinition,
  type BasemapEngineId,
  type MapAdapter,
  type MapCapabilities,
  type MapClickEvent,
  MapEngineError,
  type ViewState,
} from "@karta/core";
import { useLatestRef } from "@karta/react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMapAdapterFactory, usePreferences } from "../services";
import type { MapContextValue } from "./MapContext";

/** Capabilities assumed before any engine exists (server rendering, first paint). */
const NO_CAPABILITIES: MapCapabilities = Object.freeze({
  supportsRotation: false,
  supportsFeatureQuery: false,
});

/** Zoom differences below this count as equal when deciding whether a limit is reached. */
const ZOOM_EPSILON = 1e-6;

/** Options for {@link useMapEngine}. */
export interface UseMapEngineOptions {
  /** The map region; it carries `data-zoom` and receives focus. */
  readonly hostRef: RefObject<HTMLElement | null>;
  /** The element each engine element is appended to. */
  readonly slotRef: RefObject<HTMLElement | null>;
  /** Written with the mounted adapter, or null, for event handlers outside this hook. */
  readonly adapterRef: RefObject<MapAdapter | null>;
  /** Class name of each element an engine mounts into. */
  readonly engineClassName: string;
  readonly initialView: ViewState;
  readonly basemap: BasemapDefinition;
  readonly onViewChange?: (view: ViewState) => void;
  readonly onEngineSwitch?: (basemap: BasemapDefinition) => void;
  readonly onEngineError?: (
    error: MapEngineError,
    basemap: BasemapDefinition,
  ) => void;
  readonly onClick?: (event: MapClickEvent) => void;
  /** Called on every `moveEnd`, before `onViewChange`. */
  readonly onMoveEnd: () => void;
  /** Returns true when an engine click should be dropped (after a long-press). */
  readonly shouldDropClick: () => boolean;
}

/** Turns any mount or basemap failure into the typed engine error. */
function toEngineError(reason: unknown): MapEngineError {
  if (reason instanceof MapEngineError) {
    return reason;
  }
  const detail = reason instanceof Error ? reason.message : String(reason);
  return new MapEngineError(
    "load-failed",
    `The map engine could not start: ${detail}`,
  );
}

/**
 * Owns the map engine's life: creates and mounts an adapter for the active
 * basemap, swaps basemaps on the same engine, replaces the engine when the
 * basemap needs the other one, and tracks view, loading and errors.
 *
 * @remarks
 * - Each engine gets a fresh element, created here and appended to the slot,
 *   so React never renders into or reclasses engine DOM and no engine DOM is
 *   reused across engines.
 * - The view carried across an engine switch comes from the last view the old
 *   adapter reported (seeded from `initialView`), never from an adapter that
 *   had not finished mounting. The bearing is zeroed for an engine without
 *   rotation.
 * - Every `mount` result is checked against a per-mount `cancelled` flag, so
 *   with rapid changes the last basemap wins and late mounts are ignored.
 *   Cleanup always destroys the adapter, mounted or not.
 * - If focus was inside the old engine element, it moves to the region before
 *   that element is removed, so it never falls back to the page body.
 * - Subscriptions are made before `mount`, because an engine may emit `load`
 *   while mounting.
 */
export function useMapEngine(options: UseMapEngineOptions): MapContextValue {
  const createAdapter = useMapAdapterFactory();
  const { reducedMotion } = usePreferences();
  const latest = useLatestRef(options);
  const reducedMotionRef = useLatestRef(reducedMotion);
  const { basemap, adapterRef } = options;

  const viewRef = useRef(options.initialView);
  const frameRef = useRef(0);
  const appliedBasemapRef = useRef<BasemapDefinition | null>(null);
  const basemapTokenRef = useRef(0);
  const cycleErrorRef = useRef(false);
  const mountedEngineRef = useRef<BasemapEngineId | null>(null);

  const [adapter, setAdapter] = useState<MapAdapter | null>(null);
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
  const [capabilities, setCapabilities] =
    useState<MapCapabilities>(NO_CAPABILITIES);
  const [view, setView] = useState(options.initialView);
  const [revision, setRevision] = useState(0);
  const [zoomLimits, setZoomLimits] = useState({ min: 0, max: 0 });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [error, setError] = useState<MapEngineError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const scheduleView = useCallback(() => {
    if (frameRef.current !== 0) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      setView(viewRef.current);
      setRevision((value) => value + 1);
    });
  }, []);

  const writeZoom = useCallback(
    (zoom: number) => {
      latest.current.hostRef.current?.setAttribute(
        "data-zoom",
        zoom.toFixed(2),
      );
    },
    [latest],
  );

  const applyBasemap = useCallback(
    (target: MapAdapter, next: BasemapDefinition) => {
      basemapTokenRef.current += 1;
      const token = basemapTokenRef.current;
      const isCurrent = () =>
        token === basemapTokenRef.current && adapterRef.current === target;
      cycleErrorRef.current = false;
      setError(null);
      setLoaded(false);
      target.setBasemap(next).then(
        () => {
          if (isCurrent()) {
            setZoomLimits({
              min: target.getMinZoom(),
              max: target.getMaxZoom(),
            });
          }
        },
        (reason: unknown) => {
          if (isCurrent()) {
            const engineError = toEngineError(reason);
            setError(engineError);
            latest.current.onEngineError?.(engineError, next);
          }
        },
      );
    },
    [adapterRef, latest],
  );

  const engine = basemap.engine;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `engine` and `attempt` are the triggers; the basemap itself is read from `latest` so a same-engine change does not remount.
  useEffect(() => {
    const slot = latest.current.slotRef.current;
    const host = latest.current.hostRef.current;
    if (!slot || !host) {
      return;
    }
    const target = latest.current.basemap;
    const next = createAdapter(target);
    const element = document.createElement("div");
    element.className = latest.current.engineClassName;
    slot.append(element);
    let cancelled = false;
    cycleErrorRef.current = false;
    setCapabilities(next.capabilities);
    setLoaded(false);
    setBusy(false);
    setTileError(false);
    setError(null);

    const follow = (moved: ViewState) => {
      viewRef.current = moved;
      scheduleView();
    };
    const unsubscribe = [
      next.on("move", follow),
      next.on("rotate", follow),
      next.on("zoom", (moved) => {
        follow(moved);
        writeZoom(moved.zoom);
      }),
      next.on("moveEnd", (moved) => {
        follow(moved);
        writeZoom(moved.zoom);
        latest.current.onMoveEnd();
        latest.current.onViewChange?.(moved);
      }),
      next.on("click", (event) => {
        if (!latest.current.shouldDropClick()) {
          latest.current.onClick?.(event);
        }
      }),
      next.on("load", () => {
        setLoaded(true);
        if (!cycleErrorRef.current) {
          setTileError(false);
        }
      }),
      next.on("loading", (isLoading) => {
        setBusy(isLoading);
        if (isLoading) {
          cycleErrorRef.current = false;
        } else if (!cycleErrorRef.current) {
          setTileError(false);
        }
      }),
      next.on("tileError", () => {
        cycleErrorRef.current = true;
        setTileError(true);
      }),
    ];

    const startView = next.capabilities.supportsRotation
      ? viewRef.current
      : { ...viewRef.current, bearing: 0 };
    next
      .mount(element, {
        view: startView,
        basemap: target,
        reducedMotion: reducedMotionRef.current,
      })
      .then(
        () => {
          if (cancelled) {
            return;
          }
          adapterRef.current = next;
          appliedBasemapRef.current = target;
          next.setKeyboardEnabled(false);
          viewRef.current = next.getView();
          writeZoom(viewRef.current.zoom);
          setView(viewRef.current);
          setZoomLimits({ min: next.getMinZoom(), max: next.getMaxZoom() });
          setAdapter(next);
          setHostElement(element);
          const previousEngine = mountedEngineRef.current;
          mountedEngineRef.current = target.engine;
          if (previousEngine !== null && previousEngine !== target.engine) {
            latest.current.onEngineSwitch?.(target);
          }
        },
        (reason: unknown) => {
          if (cancelled) {
            return;
          }
          const engineError = toEngineError(reason);
          setError(engineError);
          latest.current.onEngineError?.(engineError, target);
        },
      );

    return () => {
      cancelled = true;
      for (const off of unsubscribe) {
        off();
      }
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      latest.current.onMoveEnd();
      if (adapterRef.current === next) {
        adapterRef.current = null;
      }
      if (element.contains(document.activeElement)) {
        host.focus({ preventScroll: true });
      }
      next.destroy();
      element.remove();
      setAdapter(null);
      setHostElement(null);
    };
  }, [
    createAdapter,
    engine,
    attempt,
    adapterRef,
    latest,
    reducedMotionRef,
    scheduleView,
    writeZoom,
  ]);

  useEffect(() => {
    const applied = appliedBasemapRef.current;
    if (
      !adapter ||
      adapterRef.current !== adapter ||
      !applied ||
      applied.id === basemap.id ||
      applied.engine !== basemap.engine
    ) {
      return;
    }
    appliedBasemapRef.current = basemap;
    applyBasemap(adapter, basemap);
  }, [adapter, adapterRef, applyBasemap, basemap]);

  useEffect(() => {
    adapter?.setAnimationEnabled(!reducedMotion);
  }, [adapter, reducedMotion]);

  useEffect(() => {
    const host = latest.current.hostRef.current;
    if (!host) {
      return;
    }
    const observer = new ResizeObserver(() => {
      scheduleView();
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
    };
  }, [latest, scheduleView]);

  const retry = useCallback(() => {
    if (error) {
      setAttempt((value) => value + 1);
      return;
    }
    const current = adapterRef.current;
    if (current) {
      applyBasemap(current, latest.current.basemap);
    }
  }, [adapterRef, applyBasemap, error, latest]);

  const focusMap = useCallback(() => {
    latest.current.hostRef.current?.focus({ preventScroll: true });
  }, [latest]);

  const minZoom = adapter ? zoomLimits.min : basemap.minZoom;
  const maxZoom = adapter ? zoomLimits.max : basemap.maxZoom;
  const loading = error === null && (adapter === null || !loaded || busy);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` forces a new value when the projection changes without a new view (resize).
  return useMemo<MapContextValue>(
    () => ({
      adapter,
      hostElement,
      view,
      engine,
      capabilities,
      minZoom,
      maxZoom,
      canZoomIn: view.zoom < maxZoom - ZOOM_EPSILON,
      canZoomOut: view.zoom > minZoom + ZOOM_EPSILON,
      loading,
      tileError,
      error,
      retry,
      focusMap,
    }),
    [
      adapter,
      hostElement,
      view,
      revision,
      engine,
      capabilities,
      minZoom,
      maxZoom,
      loading,
      tileError,
      error,
      retry,
      focusMap,
    ],
  );
}
