import {
  type BasemapDefinition,
  type MapAdapter,
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

/** Zoom differences below this count as equal when deciding whether a limit is reached. */
const ZOOM_EPSILON = 1e-6;

/** Options for {@link useMapEngine}. */
export interface UseMapEngineOptions {
  /** The map region; it carries `data-zoom` and receives focus. */
  readonly hostRef: RefObject<HTMLElement | null>;
  /** The element the engine element is appended to. */
  readonly slotRef: RefObject<HTMLElement | null>;
  /** Written with the mounted adapter, or null, for event handlers outside this hook. */
  readonly adapterRef: RefObject<MapAdapter | null>;
  /** Class name of the element the engine mounts into. */
  readonly engineClassName: string;
  readonly initialView: ViewState;
  readonly basemap: BasemapDefinition;
  readonly onViewChange?: (view: ViewState) => void;
  readonly onEngineError?: (
    error: MapEngineError,
    basemap: BasemapDefinition,
  ) => void;
  readonly onClick?: (event: MapClickEvent) => void;
  /** Called on every `moveEnd`, before `onViewChange`. */
  readonly onMoveEnd: () => void;
  /** Returns true when an engine click should be dropped (after a long-press). */
  readonly shouldDropClick: () => boolean;
  /** Called while the person zooms with a gesture the engine handles. */
  readonly onUserZoom: () => void;
}

/**
 * What {@link useMapEngine} tracks: the map context apart from the user zoom
 * subscription, which `MapView` adds because it also owns the zoom keys.
 */
export type MapEngineState = Omit<MapContextValue, "onUserZoom">;

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
 * Owns the map engine's life: creates and mounts one adapter, swaps
 * basemaps on it with `setBasemap`, and tracks view, loading and errors.
 *
 * @remarks
 * - The engine gets a fresh element, created here and appended to the slot,
 *   so React never renders into or reclasses engine DOM.
 * - The engine mounts once, and again only after a failed mount is retried.
 *   A new mount starts from the last view the previous adapter reported
 *   (seeded from `initialView`), never from one that had not finished
 *   mounting. A basemap chosen while the engine is still mounting is applied
 *   as soon as the mount finishes.
 * - Every `mount` result is checked against a per-mount `cancelled` flag, so
 *   late mounts are ignored. Cleanup always destroys the adapter, mounted or
 *   not.
 * - If focus was inside the engine element, it moves to the region before
 *   that element is removed, so it never falls back to the page body.
 * - Subscriptions are made before `mount`, because an engine may emit `load`
 *   while mounting.
 * - An engine that stops after it loaded (`fatalError`) is reported like a
 *   failed mount, through `error` and `onEngineError`.
 */
export function useMapEngine(options: UseMapEngineOptions): MapEngineState {
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

  const [adapter, setAdapter] = useState<MapAdapter | null>(null);
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the trigger; the basemap is read from `latest` so a basemap change never remounts the engine.
  useEffect(() => {
    const slot = latest.current.slotRef.current;
    const host = latest.current.hostRef.current;
    if (!slot || !host) {
      return;
    }
    const target = latest.current.basemap;
    const next = createAdapter();
    const element = document.createElement("div");
    element.className = latest.current.engineClassName;
    slot.append(element);
    let cancelled = false;
    cycleErrorRef.current = false;
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
      next.on("userZoom", () => {
        latest.current.onUserZoom();
      }),
      next.on("fatalError", (engineError) => {
        if (cancelled) {
          return;
        }
        setError(engineError);
        latest.current.onEngineError?.(engineError, latest.current.basemap);
      }),
    ];

    next
      .mount(element, {
        view: viewRef.current,
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
      applied.id === basemap.id
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
  return useMemo<MapEngineState>(
    () => ({
      adapter,
      hostElement,
      view,
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
