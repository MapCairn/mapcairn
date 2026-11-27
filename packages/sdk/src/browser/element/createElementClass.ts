// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ThemeChoice, ViewState } from "@mapcairn/core";
import { MountMapError } from "../MountMapError";
import type { MapTool } from "../tools";
import type {
  MapEvents,
  MapHandle,
  MountLanguage,
  MountMapOptions,
  MountServices,
} from "../types";
import { WORLD_VIEW } from "../validate";
import type {
  ElementMount,
  MapCairnMapElement,
  MapCairnMapElementClass,
} from "./types";

/** What each map event is called on the element. */
const EVENT_NAMES = {
  viewchange: "mapcairn-view-change",
  click: "mapcairn-click",
  featuretap: "mapcairn-feature-tap",
  error: "mapcairn-error",
} as const satisfies Record<keyof MapEvents, string>;

/** The view attributes, and the part of a view each one sets. */
const VIEW_ATTRIBUTES = {
  latitude: "lat",
  longitude: "lng",
  zoom: "zoom",
  bearing: "bearing",
} as const;

/** The properties of the element, which a page may set before the element is defined. */
const PROPERTIES = ["services", "basemaps", "layers", "languages", "view"];

type ViewAttribute = keyof typeof VIEW_ATTRIBUTES;

/** The parts of a view that were written and not yet drawn. */
type ViewParts = { [Part in (typeof VIEW_ATTRIBUTES)[ViewAttribute]]?: number };

function isViewAttribute(name: string): name is ViewAttribute {
  return name in VIEW_ATTRIBUTES;
}

function viewFrom(base: ViewState, parts: ViewParts): ViewState {
  return {
    center: {
      lat: parts.lat ?? base.center.lat,
      lng: parts.lng ?? base.center.lng,
    },
    zoom: parts.zoom ?? base.zoom,
    bearing: parts.bearing ?? base.bearing,
  };
}

function sameView(a: ViewState, b: ViewState): boolean {
  return (
    a.center.lat === b.center.lat &&
    a.center.lng === b.center.lng &&
    a.zoom === b.zoom &&
    a.bearing === b.bearing
  );
}

function viewAttributeValue(name: ViewAttribute, value: string): number {
  const number = value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) {
    throw new MountMapError(
      "invalid-option",
      `The ${name} attribute must be a number, for example ${name}="5".`,
    );
  }
  return number;
}

/**
 * Makes the class of the `<mapcairn-map>` element over a function that draws a
 * map. It needs a browser: it is only called where `HTMLElement` exists.
 */
export function createElementClass(
  mountMap: ElementMount,
): MapCairnMapElementClass {
  class MapCairnMap extends HTMLElement implements MapCairnMapElement {
    static readonly observedAttributes = [
      ...Object.keys(VIEW_ATTRIBUTES),
      "basemap",
      "theme",
    ];

    #services: MountServices | undefined;
    #basemaps: MountMapOptions["basemaps"];
    #layers: MountMapOptions["layers"];
    #languages: readonly MountLanguage[] | undefined;
    #handle: MapHandle | undefined;
    #lastView: ViewState | undefined;
    #pending: ViewParts = {};
    #scheduled = false;
    #remount = false;

    constructor() {
      super();
      // A value set on the element before this class was defined sits on the
      // element itself and would hide the setters below, so it is set again.
      for (const name of PROPERTIES) {
        if (Object.hasOwn(this, name)) {
          const value = Reflect.get(this, name);
          Reflect.deleteProperty(this, name);
          Reflect.set(this, name, value);
        }
      }
    }

    get services() {
      return this.#services;
    }
    set services(value) {
      if (value === this.#services) {
        return;
      }
      this.#services = value;
      this.#dataChanged();
    }
    get basemaps() {
      return this.#basemaps;
    }
    set basemaps(value) {
      if (value === this.#basemaps) {
        return;
      }
      this.#basemaps = value;
      this.#dataChanged();
    }
    get layers() {
      return this.#layers;
    }
    set layers(value) {
      if (value === this.#layers) {
        return;
      }
      this.#layers = value;
      this.#dataChanged();
    }
    get languages() {
      return this.#languages;
    }
    set languages(value) {
      if (value === this.#languages) {
        return;
      }
      this.#languages = value;
      this.#dataChanged();
    }

    get map() {
      return this.#handle;
    }

    get view() {
      return this.#handle?.getView() ?? this.#lastView;
    }
    set view(value) {
      if (value === undefined) {
        return;
      }
      if (this.#handle === undefined) {
        this.#lastView = value;
        this.#pending = {};
        return;
      }
      this.#moveTo({
        lat: value.center.lat,
        lng: value.center.lng,
        zoom: value.zoom,
        bearing: value.bearing,
      });
    }

    connectedCallback() {
      this.#schedule();
    }

    disconnectedCallback() {
      this.#schedule();
    }

    attributeChangedCallback(
      name: string,
      _before: string | null,
      value: string | null,
    ) {
      if (isViewAttribute(name)) {
        this.#viewAttributeChanged(name, value);
      } else if (this.#handle !== undefined) {
        this.#report(() => this.#updateFromAttribute(name, value));
      }
    }

    #viewAttributeChanged(name: ViewAttribute, value: string | null) {
      if (value === null) {
        return;
      }
      this.#report(() => {
        this.#moveTo({
          [VIEW_ATTRIBUTES[name]]: viewAttributeValue(name, value),
        });
      });
    }

    #updateFromAttribute(name: string, value: string | null) {
      if (name === "theme") {
        this.#handle?.update({ theme: (value ?? "system") as ThemeChoice });
      } else if (value !== null) {
        this.#handle?.update({ basemap: value });
      }
    }

    /** Draws a change of view now, or keeps it for the map that has yet to be drawn. */
    #moveTo(parts: ViewParts) {
      const handle = this.#handle;
      if (handle === undefined) {
        this.#pending = { ...this.#pending, ...parts };
        return;
      }
      const current = handle.getView();
      const next = viewFrom(current, parts);
      if (!sameView(current, next)) {
        handle.setView(next);
      }
    }

    #dataChanged() {
      if (this.isConnected) {
        this.#remount = true;
        this.#schedule();
      }
    }

    #schedule() {
      if (this.#scheduled) {
        return;
      }
      this.#scheduled = true;
      queueMicrotask(() => {
        this.#scheduled = false;
        this.#sync();
      });
    }

    #sync() {
      if (!this.isConnected) {
        this.#unmount();
        return;
      }
      if (this.#handle !== undefined && !this.#remount) {
        return;
      }
      this.#remount = false;
      this.#unmount();
      this.#mount();
    }

    #options(): MountMapOptions {
      const options: {
        -readonly [K in keyof MountMapOptions]: MountMapOptions[K];
      } = {};
      const attribute = (name: string) => this.getAttribute(name) ?? undefined;
      const tools = attribute("tools");
      if (
        this.#lastView !== undefined ||
        Object.keys(this.#pending).length > 0
      ) {
        options.view = viewFrom(this.#lastView ?? WORLD_VIEW, this.#pending);
      }
      if (this.#services !== undefined) {
        options.services = this.#services;
      }
      if (this.#basemaps !== undefined) {
        options.basemaps = this.#basemaps;
      }
      if (this.#layers !== undefined) {
        options.layers = this.#layers;
      }
      if (this.#languages !== undefined) {
        options.languages = this.#languages;
      }
      const basemap = attribute("basemap");
      const theme = attribute("theme");
      const label = attribute("label");
      const language = attribute("language");
      if (basemap !== undefined) {
        options.basemap = basemap;
      }
      if (theme !== undefined) {
        options.theme = theme as ThemeChoice;
      }
      if (label !== undefined) {
        options.label = label;
      }
      if (language !== undefined) {
        options.language = language;
      }
      if (tools !== undefined) {
        options.tools = tools.split(/\s+/).filter(Boolean) as MapTool[];
      }
      return options;
    }

    #mount() {
      this.#report(() => {
        this.#handle = mountMap(this, this.#options());
        this.#pending = {};
        this.#forward(this.#handle);
      });
    }

    #forward(handle: MapHandle) {
      const send = <K extends keyof MapEvents>(type: K) =>
        handle.on(type, (detail) =>
          this.dispatchEvent(
            new CustomEvent(EVENT_NAMES[type], {
              detail,
              bubbles: true,
              composed: true,
            }),
          ),
        );
      for (const type of Object.keys(EVENT_NAMES) as (keyof MapEvents)[]) {
        send(type);
      }
    }

    #unmount() {
      const handle = this.#handle;
      if (handle === undefined) {
        return;
      }
      this.#lastView = handle.getView();
      this.#handle = undefined;
      handle.destroy();
    }

    /**
     * Runs a step that can fail on what the page wrote. A `MountMapError` is
     * the page's to fix and nobody called, so it is sent as `mapcairn-error`
     * and logged; any other error is not ours to hide.
     */
    #report(step: () => void) {
      try {
        step();
      } catch (error) {
        if (!(error instanceof MountMapError)) {
          throw error;
        }
        console.error(error.message);
        this.dispatchEvent(
          new CustomEvent("mapcairn-error", {
            detail: error,
            bubbles: true,
            composed: true,
          }),
        );
      }
    }
  }
  return MapCairnMap;
}
