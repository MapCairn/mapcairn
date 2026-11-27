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
import { samePlainData, sameServices } from "./equality";
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

/** The data properties a page may set before the element is defined. */
const DATA_PROPERTIES = ["services", "basemaps", "layers", "languages"];

/** The attributes that name the map and its tools, which are read when the map is drawn. */
const DRAWING_ATTRIBUTES = ["label", "language", "tools"];

/** The attributes that change a map that is showing. */
const LIVE_ATTRIBUTES = ["basemap", "theme"];

/** What marks a class as this element's, so a second copy of the SDK on a page can tell it from another element's. */
export const ELEMENT_MARKER = "mapcairnMapElement";

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
    static readonly mapcairnMapElement = true;
    static readonly observedAttributes = [
      ...Object.keys(VIEW_ATTRIBUTES),
      ...LIVE_ATTRIBUTES,
      ...DRAWING_ATTRIBUTES,
    ];

    #services: MountServices | undefined;
    #basemaps: MountMapOptions["basemaps"];
    #layers: MountMapOptions["layers"];
    #languages: readonly MountLanguage[] | undefined;
    #handle: MapHandle | undefined;
    #lastView: ViewState | undefined;
    /** The view the element last asked the map for, until the map reports one. */
    #asked: ViewState | undefined;
    #upgradedView: ViewState | undefined;
    #pending: ViewParts = {};
    #scheduled = false;
    #remount = false;

    constructor() {
      super();
      // A value set on the element before this class was defined sits on the
      // element itself and would hide the setters below, so it is set again.
      for (const name of DATA_PROPERTIES) {
        if (Object.hasOwn(this, name)) {
          const value = Reflect.get(this, name);
          Reflect.deleteProperty(this, name);
          Reflect.set(this, name, value);
        }
      }
      // The view is set again when the element connects, after the attributes
      // the page's markup gave it, which the browser reports after this.
      if (Object.hasOwn(this, "view")) {
        this.#upgradedView = Reflect.get(this, "view");
        Reflect.deleteProperty(this, "view");
      }
      Reflect.deleteProperty(this, "map");
    }

    get services() {
      return this.#services;
    }
    set services(value) {
      if (sameServices(value, this.#services)) {
        return;
      }
      this.#services = value;
      this.#dataChanged();
    }
    get basemaps() {
      return this.#basemaps;
    }
    set basemaps(value) {
      if (samePlainData(value, this.#basemaps)) {
        return;
      }
      this.#basemaps = value;
      this.#dataChanged();
    }
    get layers() {
      return this.#layers;
    }
    set layers(value) {
      if (samePlainData(value, this.#layers)) {
        return;
      }
      this.#layers = value;
      this.#dataChanged();
    }
    get languages() {
      return this.#languages;
    }
    set languages(value) {
      if (samePlainData(value, this.#languages)) {
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
        this.#schedule();
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
      if (this.#upgradedView !== undefined) {
        this.view = this.#upgradedView;
        this.#upgradedView = undefined;
      }
      this.#schedule();
    }

    disconnectedCallback() {
      this.#schedule();
    }

    attributeChangedCallback(
      name: string,
      before: string | null,
      value: string | null,
    ) {
      if (before !== value) {
        this.#attributeChanged(name, value);
      }
      // A map that could not be drawn is tried again on any change.
      if (this.isConnected && this.#handle === undefined) {
        this.#schedule();
      }
    }

    #attributeChanged(name: string, value: string | null) {
      if (isViewAttribute(name)) {
        this.#viewAttributeChanged(name, value);
      } else if (DRAWING_ATTRIBUTES.includes(name)) {
        this.#dataChanged();
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

    /** Keeps a change of view for the next microtask, so changes written in one tick are one move. */
    #moveTo(parts: ViewParts) {
      this.#pending = { ...this.#pending, ...parts };
      this.#schedule();
    }

    /**
     * Moves the map to what was written since the last move, on top of the
     * view the element last asked for (or the one the map reported since), so
     * a change made while an earlier one is still moving does not undo it.
     */
    #applyPending(handle: MapHandle) {
      if (Object.keys(this.#pending).length === 0) {
        return;
      }
      const next = viewFrom(this.#asked ?? handle.getView(), this.#pending);
      this.#pending = {};
      this.#report(() => {
        if (!sameView(handle.getView(), next)) {
          handle.setView(next);
        }
        this.#asked = next;
      });
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
        this.#applyPending(this.#handle);
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
        this.#asked = this.#handle.getView();
        this.#forward(this.#handle);
      });
    }

    #forward(handle: MapHandle) {
      const send = <K extends keyof MapEvents>(type: K) =>
        handle.on(type, (detail) => {
          if (type === "viewchange") {
            this.#asked = detail as ViewState;
          }
          if (type === "error") {
            console.error((detail as Error).message);
          }
          this.dispatchEvent(
            new CustomEvent(EVENT_NAMES[type], {
              detail,
              bubbles: true,
              composed: true,
            }),
          );
        });
      for (const type of Object.keys(EVENT_NAMES) as (keyof MapEvents)[]) {
        send(type);
      }
    }

    #unmount() {
      const handle = this.#handle;
      if (handle === undefined) {
        return;
      }
      this.#lastView = this.#asked ?? handle.getView();
      this.#asked = undefined;
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
