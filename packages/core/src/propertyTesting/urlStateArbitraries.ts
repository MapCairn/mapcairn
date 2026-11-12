// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import type { ViewState } from "../ports/geometry";
import type { LayersUrlState, UrlStateValue } from "../ports/url";
import { positionOnGrid } from "./geoArbitraries";

/** Zoom is written to two decimals, so a zoom on this grid survives the address bar. */
const ZOOM_UNITS_PER_LEVEL = 100;
const MAX_ZOOM = 24;

/** The bearing is written as a whole number of degrees, from 0 up to 360. */
const WHOLE_BEARINGS = 360;

const MAX_ENABLED_LAYERS = 5;
const MAX_CONTROLS_PER_LAYER = 3;
const MAX_SHARED_SHAPES_LENGTH = 200;

/** Short ids and values the address bar accepts: a subset of what it reads. */
const LAYER_ID = /^[a-z][a-z0-9-]{0,15}$/;
const CONTROL_ID = /^[a-z][a-z0-9-]{0,15}$/;
const CONTROL_VALUE = /^[a-z0-9._-]{1,12}$/;
const BASEMAP_ID = /^[a-z0-9-]{1,64}$/;
const SHARED_SHAPES = new RegExp(
  `^[A-Za-z0-9._-]{1,${MAX_SHARED_SHAPES_LENGTH}}$`,
);

const view: fc.Arbitrary<ViewState> = fc.record({
  center: positionOnGrid,
  zoom: fc
    .integer({ min: 0, max: MAX_ZOOM * ZOOM_UNITS_PER_LEVEL })
    .map((units) => units / ZOOM_UNITS_PER_LEVEL),
  bearing: fc.integer({ min: 0, max: WHOLE_BEARINGS - 1 }),
});

/** The control values a layer has set: some, or none at all. */
const controlValues: fc.Arbitrary<Record<string, string> | null> = fc.option(
  fc.dictionary(
    fc.stringMatching(CONTROL_ID),
    fc.stringMatching(CONTROL_VALUE),
    { minKeys: 1, maxKeys: MAX_CONTROLS_PER_LAYER },
  ),
  { nil: null },
);

/** Layers that are on, each with some, or none, of its control values set. */
const layers: fc.Arbitrary<LayersUrlState> = fc
  .dictionary(fc.stringMatching(LAYER_ID), controlValues, {
    minKeys: 1,
    maxKeys: MAX_ENABLED_LAYERS,
  })
  .map((valuesByLayer) => {
    const controls: Record<string, Record<string, string>> = {};
    for (const [id, values] of Object.entries(valuesByLayer)) {
      if (values !== null) {
        controls[id] = values;
      }
    }
    return { enabled: Object.keys(valuesByLayer), controls };
  });

/**
 * The shareable state of the app, with any part of it present or absent, and
 * everything that is present written the way the address bar writes it, so
 * that reading it back gives the same value.
 */
export const urlStateValue: fc.Arbitrary<UrlStateValue> = fc.record(
  {
    view,
    basemapId: fc.stringMatching(BASEMAP_ID),
    layers,
    shapes: fc.stringMatching(SHARED_SHAPES),
  },
  { requiredKeys: [] },
);
