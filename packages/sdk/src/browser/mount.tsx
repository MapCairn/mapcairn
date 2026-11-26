// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  emptyLayerCatalogue,
  type MapAdapterFactory,
  type MapEngineError,
  MemorySettingsStore,
  type Services,
  type ViewState,
} from "@mapcairn/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import { createRoot } from "react-dom/client";
import { createAdapterTap } from "./adapterTap";
import { ContainerLanguage } from "./ContainerLanguage";
import { nextIdentifierPrefix } from "./identifiers";
import { buildLayers } from "./layers";
import { MountedMap } from "./MountedMap";
import { MountMapError } from "./MountMapError";
import { buildServices } from "./services";
import type { MapEvents, MapHandle, MountMapOptions } from "./types";
import {
  assertBasemap,
  assertPartialView,
  assertTheme,
  sameOriginWorkerUrl,
  validateOptions,
} from "./validate";

/** The attribute that marks an element that holds a map, and says whether the map has a label. */
const MARKER = "data-mapcairn";
const THEME_ATTRIBUTE_NAME = "data-theme";

/** What `mount` needs from outside, so a test can give it a fake engine. */
export interface MountDependencies {
  /** Makes the factory of the map adapter, given the address of the engine's worker. */
  readonly createMapAdapter: (workerUrl: string) => MapAdapterFactory;
  /** The address of the worker the files are served with, used when the page names none. */
  readonly defaultWorkerUrl: () => string;
  /** For tests: replaces the services before the interface sees them. */
  readonly decorateServices?: (services: Services) => Services;
}

type Listeners = { [K in keyof MapEvents]: Set<(event: MapEvents[K]) => void> };

function warnAboutLabels(
  element: HTMLElement,
  label: string | undefined,
): void {
  if (
    label === undefined &&
    document.querySelector(`[${MARKER}="unlabelled"]`) !== null
  ) {
    console.warn(
      "There is more than one map on this page without a label, so their landmarks share a name. Give each map a label.",
    );
  }
  if (element.getBoundingClientRect().height === 0) {
    console.warn(
      "The map's element has no height, so nothing shows. Give it a height in CSS.",
    );
  }
}

/**
 * Mounts a map into `element` with the services and the engine `dependencies`
 * name. `mountMap` is this with the real ones.
 *
 * @throws MountMapError for a call that cannot work.
 */
export function mount(
  element: HTMLElement,
  options: MountMapOptions,
  dependencies: MountDependencies,
): MapHandle {
  if (typeof document === "undefined") {
    throw new MountMapError(
      "server",
      "mountMap needs a browser. Call it from code that runs in the page, not on the server.",
    );
  }
  if (!(element instanceof HTMLElement)) {
    throw new MountMapError(
      "invalid-option",
      'mountMap needs an element to draw the map in, for example document.getElementById("map").',
    );
  }
  if (element.hasAttribute(MARKER)) {
    throw new MountMapError(
      "element-in-use",
      "This element already holds a map. Call destroy() on its handle first.",
    );
  }
  const valid = validateOptions(options);
  const workerUrl = sameOriginWorkerUrl(
    options.workerUrl ?? dependencies.defaultWorkerUrl(),
  );

  const listeners: Listeners = {
    viewchange: new Set(),
    click: new Set(),
    featuretap: new Set(),
    error: new Set(),
  };
  const emit = <K extends keyof MapEvents>(type: K, event: MapEvents[K]) => {
    for (const listener of [...listeners[type]]) {
      listener(event);
    }
  };
  const layers = buildLayers(options.layers, {
    layerSource: options.services?.layerSource,
    report: (problem) => emit("error", problem),
  });

  const tap = createAdapterTap(valid.view);
  const settings = new MemorySettingsStore({
    persistent: false,
    initial: { theme: valid.theme, language: valid.languages.initial },
  });
  const built = buildServices({
    element,
    basemaps: valid.basemaps,
    settings,
    createMapAdapter: tap.wrap(dependencies.createMapAdapter(workerUrl)),
    provided: options.services ?? {},
    layers: valid.tools.has("map-options")
      ? layers.catalogue
      : emptyLayerCatalogue,
    languages: valid.languages.catalogue,
  });
  const services =
    dependencies.decorateServices?.(built.services) ?? built.services;

  const adopterSetDirection = element.hasAttribute("dir");
  warnAboutLabels(element, valid.label);
  element.setAttribute(
    MARKER,
    valid.label === undefined ? "unlabelled" : "labelled",
  );
  let basemapId = valid.basemapId;
  let destroyed = false;
  const root = createRoot(element, {
    identifierPrefix: nextIdentifierPrefix(),
  });

  const draw = () => {
    root.render(
      <ServicesProvider services={services}>
        <LiveRegionProvider>
          <TooltipProvider>
            <ContainerLanguage
              element={element}
              writeDirection={!adopterSetDirection}
            />
            <MountedMap
              basemaps={valid.basemaps}
              basemapId={basemapId}
              onBasemapChange={(id: string) => {
                basemapId = id;
                draw();
              }}
              tools={valid.tools}
              hasLayers={layers.present}
              label={valid.label}
              initialView={valid.view}
              onViewChange={(view: ViewState) => {
                tap.rememberView(view);
                emit("viewchange", view);
              }}
              onClick={(position) => emit("click", position)}
              onFeatureTap={(featureTap) => emit("featuretap", featureTap)}
              onEngineError={(error: MapEngineError) => emit("error", error)}
            />
          </TooltipProvider>
        </LiveRegionProvider>
      </ServicesProvider>,
    );
  };
  draw();

  return {
    ready: tap.ready,
    getView: () => tap.getView(),
    setView: (view, moveOptions) => {
      if (destroyed) {
        return;
      }
      assertPartialView(view, "view");
      const move = () => tap.mountedAdapter()?.setView(view, moveOptions);
      if (tap.mountedAdapter() === undefined) {
        void tap.ready.then(move, () => {});
        return;
      }
      move();
    },
    update: (update) => {
      if (destroyed) {
        return;
      }
      if (update.basemap !== undefined) {
        assertBasemap(valid.basemaps, update.basemap);
      }
      if (update.theme !== undefined) {
        assertTheme(update.theme);
      }
      if (update.theme !== undefined) {
        settings.set({ theme: update.theme });
      }
      if (update.basemap !== undefined && update.basemap !== basemapId) {
        basemapId = update.basemap;
        draw();
      }
    },
    on: (type, listener) => {
      if (destroyed) {
        return () => {};
      }
      const set = listeners[type] as Set<typeof listener>;
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      root.unmount();
      layers.dispose();
      built.dispose();
      tap.release();
      for (const set of Object.values(listeners)) {
        set.clear();
      }
      element.removeAttribute(THEME_ATTRIBUTE_NAME);
      element.removeAttribute(MARKER);
      element.replaceChildren();
    },
  };
}
