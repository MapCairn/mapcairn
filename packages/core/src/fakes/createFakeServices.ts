// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Services } from "../ports/services";
import { FakeClipboard } from "./FakeClipboard";
import { FakeDevicePreferences } from "./FakeDevicePreferences";
import { FakeFeatureQuery } from "./FakeFeatureQuery";
import { FakeFileOpener } from "./FakeFileOpener";
import { FakeFileSaver } from "./FakeFileSaver";
import { FakeLayerCatalogue } from "./FakeLayerCatalogue";
import { FakeLayerSource } from "./FakeLayerSource";
import { FakeLocationProvider } from "./FakeLocationProvider";
import {
  createFakeMapAdapterFactory,
  type FakeMapAdapter,
} from "./FakeMapAdapter";
import { FakeRoutingProvider } from "./FakeRoutingProvider";
import { FakeSearchProvider } from "./FakeSearchProvider";
import { FakeSuggestionProvider } from "./FakeSuggestionProvider";
import { FakeThemeSource } from "./FakeThemeSource";
import { MemoryFeatureSelection } from "./MemoryFeatureSelection";
import { MemorySettingsStore } from "./MemorySettingsStore";
import { MemoryUrlState } from "./MemoryUrlState";

/** The fakes behind a {@link FakeServices}, for scripting and inspection. */
export interface FakeServiceHandles {
  readonly search: FakeSearchProvider;
  readonly suggestions: FakeSuggestionProvider;
  readonly location: FakeLocationProvider;
  readonly settings: MemorySettingsStore;
  readonly clipboard: FakeClipboard;
  readonly fileSaver: FakeFileSaver;
  readonly fileOpener: FakeFileOpener;
  readonly url: MemoryUrlState;
  readonly theme: FakeThemeSource;
  readonly preferences: FakeDevicePreferences;
  readonly layers: FakeLayerCatalogue;
  readonly layerSource: FakeLayerSource;
  readonly routing: FakeRoutingProvider;
  readonly selection: MemoryFeatureSelection;
  readonly featureQuery: FakeFeatureQuery;
  /** Every adapter `createMapAdapter` has built, oldest first. */
  readonly maps: FakeMapAdapter[];
}

/** A complete {@link Services} built from fakes, plus handles to script them. */
export interface FakeServices extends Services {
  readonly fakes: FakeServiceHandles;
}

/**
 * Builds a complete {@link Services} from the fakes.
 *
 * How to script it: script the objects under `fakes` (for example
 * `fakes.search.setDefaultResults(...)`). To replace a part, pass it in
 * `overrides`; the returned service then uses your object, and the matching
 * entry in `fakes` is left unused.
 *
 * The default `createMapAdapter` is {@link createFakeMapAdapterFactory}, and
 * each adapter it builds is recorded in `fakes.maps`.
 *
 * `routing`, `fileOpener`, `suggestions`, `selection` and `featureQuery` are
 * optional on `Services`, but the fakes include them so a test can script
 * routes, files, suggestions, a selected set and the features inside a shape.
 * To test the ui without one, pass it as
 * `undefined`, for example `{ routing: undefined }`.
 */
export function createFakeServices(
  overrides: Partial<Services> = {},
): FakeServices {
  const maps: FakeMapAdapter[] = [];
  const fakes: FakeServiceHandles = {
    search: new FakeSearchProvider(),
    suggestions: new FakeSuggestionProvider(),
    location: new FakeLocationProvider(),
    settings: new MemorySettingsStore(),
    clipboard: new FakeClipboard(),
    fileSaver: new FakeFileSaver(),
    fileOpener: new FakeFileOpener(),
    url: new MemoryUrlState(),
    theme: new FakeThemeSource(),
    preferences: new FakeDevicePreferences(),
    layers: new FakeLayerCatalogue(),
    layerSource: new FakeLayerSource(),
    routing: new FakeRoutingProvider(),
    selection: new MemoryFeatureSelection(),
    featureQuery: new FakeFeatureQuery(),
    maps,
  };
  return {
    createMapAdapter: createFakeMapAdapterFactory((adapter) => {
      maps.push(adapter);
    }),
    search: fakes.search,
    suggestions: fakes.suggestions,
    location: fakes.location,
    settings: fakes.settings,
    clipboard: fakes.clipboard,
    fileSaver: fakes.fileSaver,
    fileOpener: fakes.fileOpener,
    url: fakes.url,
    theme: fakes.theme,
    preferences: fakes.preferences,
    layers: fakes.layers,
    layerSource: fakes.layerSource,
    routing: fakes.routing,
    selection: fakes.selection,
    featureQuery: fakes.featureQuery,
    ...overrides,
    fakes,
  };
}
