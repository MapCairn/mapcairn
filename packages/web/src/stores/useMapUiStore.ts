import type { Basemap } from "@karta/map";
import { create } from "zustand";
import { getLayerGroupStructure } from "../layers/registry";

function findGroupContaining(id: string) {
  return getLayerGroupStructure().find((group) => group.layerIds.includes(id));
}

function isExclusiveGroupMember(id: string): boolean {
  return findGroupContaining(id)?.selectionMode === "exclusive";
}

function groupSiblings(id: string): string[] {
  const group = findGroupContaining(id);
  /* v8 ignore next 3 -- unreachable: groupSiblings is only called after isExclusiveGroupMember(id) already confirmed selectionMode === "exclusive" */
  if (group?.selectionMode !== "exclusive") {
    return [];
  }
  return group.layerIds.filter((sibling) => sibling !== id);
}

/**
 * Every valid `PanelView`, the single source of truth `PanelView` derives
 * from; so a caller needing the runtime value set (e.g. validating a
 * permalink's `?panel=` query param) doesn't hand-maintain a second copy of
 * this list that could drift from the type.
 */
export const PANEL_VIEWS = ["layers", "story", "browser"] as const;

/**
 * Which view the info panel shows: layer toggles, the domain's story copy,
 * or a browsable list of the domain's selectable features.
 */
export type PanelView = (typeof PANEL_VIEWS)[number];

/** The one map surface that may be open above the map at a time. */
export const MAP_SURFACES = [
  "explore",
  "measure",
  "settings",
  "legend",
  "feature",
] as const;

/** A mutually exclusive map surface, or `null` when the map is unobstructed. */
export type MapSurface = (typeof MAP_SURFACES)[number] | null;

/** Mobile sheet resting positions. */
export const SHEET_DETENTS = ["peek", "half", "full"] as const;

/** A supported mobile sheet detent. */
export type SheetDetent = (typeof SHEET_DETENTS)[number];

/**
 * Resolves the next sheet detent from a projected pointer delta.
 * @remarks Negative deltas move upward; a downward drag from `peek` dismisses
 *   the Explore surface and returns `null`.
 */
export function resolveSheetDetent(
  current: SheetDetent,
  projectedDelta: number,
): SheetDetent | null {
  if (projectedDelta < -36) {
    if (current === "peek") {
      return "half";
    }
    if (current === "half") {
      return "full";
    }
    return "full";
  }
  if (projectedDelta > 36) {
    if (current === "full") {
      return "half";
    }
    if (current === "half") {
      return "peek";
    }
    return null;
  }
  return current;
}

/** The app's UI state: layer visibility, basemap, panel state, and feature selection. */
interface MapUiState {
  visibleLayerIds: string[];
  opacityByLayer: Record<string, number>;
  basemap: Basemap;
  activeSurface: MapSurface;
  sheetDetent: SheetDetent;
  panelView: PanelView;
  selectedFeatureId: string | null;
  toggleLayer: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setBasemap: (basemap: Basemap) => void;
  setActiveSurface: (surface: MapSurface) => void;
  setSheetDetent: (detent: SheetDetent) => void;
  setPanelOpen: (open: boolean) => void;
  setPanelView: (view: PanelView) => void;
  setSelectedFeatureId: (id: string | null) => void;
  reset: () => void;
}

/**
 * The reference app's default state: a neutral Positron basemap with no
 * overlays, open surfaces, or selection. Also the reference point `useMapPermalink` diffs
 * against to decide which fields a shareable URL needs to carry.
 */
export function getDefaultMapUiState() {
  return {
    visibleLayerIds: [],
    opacityByLayer: {},
    basemap: "positron" as const,
    activeSurface: null,
    sheetDetent: "half" as const,
    panelView: "layers" as const,
    selectedFeatureId: null,
  };
}

/**
 * The app's Zustand UI-state store.
 * @remarks `toggleLayer` enforces each layer group's `selectionMode`: toggling
 *   on a member of an `"exclusive"` group turns off its sibling layers in the
 *   same group; `"independent"` groups don't affect each other's layers.
 */
export const useMapUiStore = create<MapUiState>()((set) => ({
  ...getDefaultMapUiState(),
  toggleLayer: (id) =>
    set((state) => {
      if (state.visibleLayerIds.includes(id)) {
        return {
          visibleLayerIds: state.visibleLayerIds.filter(
            (existing) => existing !== id,
          ),
        };
      }

      if (isExclusiveGroupMember(id)) {
        const siblings = groupSiblings(id);
        return {
          visibleLayerIds: [
            ...state.visibleLayerIds.filter(
              (existing) => !siblings.includes(existing),
            ),
            id,
          ],
        };
      }

      return { visibleLayerIds: [...state.visibleLayerIds, id] };
    }),
  setBasemap: (basemap) => set({ basemap }),
  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      opacityByLayer: {
        ...state.opacityByLayer,
        [id]: Math.max(0, Math.min(1, opacity)),
      },
    })),
  setActiveSurface: (activeSurface) => set({ activeSurface }),
  setSheetDetent: (sheetDetent) => set({ sheetDetent }),
  setPanelOpen: (open) => set({ activeSurface: open ? "explore" : null }),
  setPanelView: (panelView) => set({ panelView }),
  setSelectedFeatureId: (selectedFeatureId) => set({ selectedFeatureId }),
  reset: () => set(getDefaultMapUiState()),
}));
