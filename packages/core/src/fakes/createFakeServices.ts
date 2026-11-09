import type { Services } from "../ports/services";
import { FakeClipboard } from "./FakeClipboard";
import { FakeDevicePreferences } from "./FakeDevicePreferences";
import { FakeLocationProvider } from "./FakeLocationProvider";
import {
  createFakeMapAdapterFactory,
  type FakeMapAdapter,
} from "./FakeMapAdapter";
import { FakeSearchProvider } from "./FakeSearchProvider";
import { FakeThemeSource } from "./FakeThemeSource";
import { MemorySettingsStore } from "./MemorySettingsStore";
import { MemoryUrlState } from "./MemoryUrlState";
import { StaticLayerRegistry } from "./StaticLayerRegistry";

/** The fakes behind a {@link FakeServices}, for scripting and inspection. */
export interface FakeServiceHandles {
  readonly search: FakeSearchProvider;
  readonly location: FakeLocationProvider;
  readonly settings: MemorySettingsStore;
  readonly clipboard: FakeClipboard;
  readonly url: MemoryUrlState;
  readonly theme: FakeThemeSource;
  readonly preferences: FakeDevicePreferences;
  readonly layers: StaticLayerRegistry;
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
 * The default `createMapAdapter` is {@link createFakeMapAdapterFactory}: the
 * capabilities follow the basemap's engine, and each adapter is recorded in
 * `fakes.maps`.
 */
export function createFakeServices(
  overrides: Partial<Services> = {},
): FakeServices {
  const maps: FakeMapAdapter[] = [];
  const fakes: FakeServiceHandles = {
    search: new FakeSearchProvider(),
    location: new FakeLocationProvider(),
    settings: new MemorySettingsStore(),
    clipboard: new FakeClipboard(),
    url: new MemoryUrlState(),
    theme: new FakeThemeSource(),
    preferences: new FakeDevicePreferences(),
    layers: new StaticLayerRegistry(),
    maps,
  };
  return {
    createMapAdapter: createFakeMapAdapterFactory((adapter) => {
      maps.push(adapter);
    }),
    search: fakes.search,
    location: fakes.location,
    settings: fakes.settings,
    clipboard: fakes.clipboard,
    url: fakes.url,
    theme: fakes.theme,
    preferences: fakes.preferences,
    layers: fakes.layers,
    ...overrides,
    fakes,
  };
}
