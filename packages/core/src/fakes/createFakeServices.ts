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
import { FakeMessageCatalogue } from "./FakeMessageCatalogue";
import { FakeRoutingProvider } from "./FakeRoutingProvider";
import { FakeSearchProvider } from "./FakeSearchProvider";
import { FakeSuggestionProvider } from "./FakeSuggestionProvider";
import { FakeThemeSource } from "./FakeThemeSource";
import { MemoryFeatureSelection } from "./MemoryFeatureSelection";
import { MemorySettingsStore } from "./MemorySettingsStore";
import { MemoryUrlState } from "./MemoryUrlState";

/** The fakes behind a {@link FakeServices}, for scripting and inspection. */
export interface FakeServiceHandles {
  /** The search provider the services use. */
  readonly search: FakeSearchProvider;
  /** The suggestion provider the services use. */
  readonly suggestions: FakeSuggestionProvider;
  /** The location provider the services use. */
  readonly location: FakeLocationProvider;
  /** The settings store the services use. */
  readonly settings: MemorySettingsStore;
  /** The clipboard the services use. */
  readonly clipboard: FakeClipboard;
  /** The file saver the services use. */
  readonly fileSaver: FakeFileSaver;
  /** The file opener the services use. */
  readonly fileOpener: FakeFileOpener;
  /** The address state the services use. */
  readonly url: MemoryUrlState;
  /** The theme source the services use. */
  readonly theme: FakeThemeSource;
  /** The message catalogue the services use. */
  readonly messages: FakeMessageCatalogue;
  /** The device preferences the services use. */
  readonly preferences: FakeDevicePreferences;
  /** The layer catalogue the services use. */
  readonly layers: FakeLayerCatalogue;
  /** The layer source the services use. */
  readonly layerSource: FakeLayerSource;
  /** The routing provider the services use. */
  readonly routing: FakeRoutingProvider;
  /** The feature selection the services use. */
  readonly selection: MemoryFeatureSelection;
  /** The feature query the services use. */
  readonly featureQuery: FakeFeatureQuery;
  /** Every adapter `createMapAdapter` has built, oldest first. */
  readonly maps: FakeMapAdapter[];
}

/** A complete {@link Services} built from fakes, plus handles to script them. */
export interface FakeServices extends Services {
  /** The fakes behind the services, typed as themselves so a test can script them. */
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
    messages: new FakeMessageCatalogue(),
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
    messages: fakes.messages,
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
