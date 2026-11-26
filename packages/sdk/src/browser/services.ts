// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  FakeClipboard,
  FakeFileSaver,
  FakeLayerCatalogue,
  FakeLayerSource,
  FakeLocationProvider,
  FakeSearchProvider,
  type MapAdapterFactory,
  type MemorySettingsStore,
  MemoryUrlState,
  type Services,
} from "@mapcairn/core";
import { BrowserDevicePreferences } from "./BrowserDevicePreferences";
import { BrowserThemeSource } from "./BrowserThemeSource";
import type { MountServices } from "./types";

/** What {@link buildServices} puts together. */
export interface ServicesInput {
  /** The element whose theme the services write. */
  readonly element: HTMLElement;
  readonly basemaps: BasemapCatalogue;
  readonly settings: MemorySettingsStore;
  readonly createMapAdapter: MapAdapterFactory;
  /** The providers the page wrote. */
  readonly provided: MountServices;
}

/**
 * The services a mounted map runs on: the map adapter it is given, the
 * page's own providers, a theme source and device preferences written for the
 * browser, in-memory settings and address state (so the map reads and writes
 * nothing on the device and never touches the page's address) and core's
 * in-memory fakes for the ports the composed interface never calls. A fake
 * succeeds quietly, so the tests hold each of them unreachable.
 */
export function buildServices({
  element,
  basemaps,
  settings,
  createMapAdapter,
  provided,
}: ServicesInput): Services {
  return {
    createMapAdapter,
    search: provided.search ?? new FakeSearchProvider(),
    ...(provided.suggestions === undefined
      ? {}
      : { suggestions: provided.suggestions }),
    location: provided.location ?? new FakeLocationProvider(),
    settings,
    clipboard: new FakeClipboard(),
    fileSaver: new FakeFileSaver(),
    url: new MemoryUrlState(),
    theme: new BrowserThemeSource(element),
    messages: createMessageCatalogue("en-GB", EN_GB_CATALOGUE, EN_GB_CATALOGUE),
    preferences: new BrowserDevicePreferences(),
    layers: new FakeLayerCatalogue(),
    layerSource: new FakeLayerSource(),
    basemaps,
  };
}
