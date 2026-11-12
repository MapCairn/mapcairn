// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { FakeClipboard } from "../fakes/FakeClipboard";
import { FakeDevicePreferences } from "../fakes/FakeDevicePreferences";
import { FakeFileOpener } from "../fakes/FakeFileOpener";
import { FakeFileSaver } from "../fakes/FakeFileSaver";
import { FakeLayerCatalogue } from "../fakes/FakeLayerCatalogue";
import { FakeLayerSource } from "../fakes/FakeLayerSource";
import { FakeLocationProvider } from "../fakes/FakeLocationProvider";
import { createFakeMapAdapterFactory } from "../fakes/FakeMapAdapter";
import { FakeRoutingProvider } from "../fakes/FakeRoutingProvider";
import { FakeSearchProvider } from "../fakes/FakeSearchProvider";
import { FakeSuggestionProvider } from "../fakes/FakeSuggestionProvider";
import { FakeThemeSource } from "../fakes/FakeThemeSource";
import { MemoryFeatureSelection } from "../fakes/MemoryFeatureSelection";
import { MemorySettingsStore } from "../fakes/MemorySettingsStore";
import { MemoryUrlState } from "../fakes/MemoryUrlState";
import type { Services } from "../ports/services";
import { runClipboardContract } from "./clipboard.contract";
import { runDevicePreferencesContract } from "./devicePreferences.contract";
import { runFeatureSelectionContract } from "./featureSelection.contract";
import { runFileOpenerContract } from "./fileOpener.contract";
import { runFileSaverContract } from "./fileSaver.contract";
import { runLayerCatalogueContract } from "./layerCatalogue.contract";
import { runLayerSourceContract } from "./layerSource.contract";
import { runLocationProviderContract } from "./locationProvider.contract";
import { runMapAdapterContract } from "./mapAdapter.contract";
import { runRoutingProviderContract } from "./routingProvider.contract";
import { runSearchProviderContract } from "./searchProvider.contract";
import { runSettingsStoreContract } from "./settingsStore.contract";
import { runSuggestionProviderContract } from "./suggestionProvider.contract";
import { runThemeSourceContract } from "./themeSource.contract";
import { runUrlStateContract } from "./urlState.contract";

/**
 * Every key of `Services`, kept by hand. The `satisfies` clause rejects a
 * name that is not a service, and {@link PortsAreExhaustive} rejects a service
 * missing from this list, so adding a service without updating the list is a
 * type error.
 */
export const PORT_NAMES = [
  "createMapAdapter",
  "search",
  "suggestions",
  "location",
  "settings",
  "clipboard",
  "fileSaver",
  "fileOpener",
  "url",
  "theme",
  "preferences",
  "layers",
  "layerSource",
  "routing",
  "selection",
] as const satisfies readonly (keyof Services)[];

/** The name of one port, as it appears on `Services`. */
export type PortName = (typeof PORT_NAMES)[number];

/**
 * The ports a host may leave out. Each is an optional key of `Services`, so
 * the ui must work without it. The reference host builds a real adapter for
 * each of these except the ones in {@link HOST_SUPPLIED_PORT_NAMES}.
 */
export const OPTIONAL_PORT_NAMES = [
  "fileOpener",
  "routing",
  "selection",
  "suggestions",
] as const satisfies readonly PortName[];

/**
 * The optional ports that `createServices()` leaves out, because the data
 * they hold belongs to the host that supplies them and an inert one would be
 * dead code in production. They still have a fake and a contract suite.
 */
export const HOST_SUPPLIED_PORT_NAMES = [
  "selection",
] as const satisfies readonly (typeof OPTIONAL_PORT_NAMES)[number][];

/**
 * The `Services` entries that are plain data a host supplies, not ports: they
 * have one shape and no second implementation, so they have no fake and no
 * contract suite. The basemaps a host offers are the one so far.
 */
export const DATA_SERVICE_NAMES = [
  "basemaps",
] as const satisfies readonly (keyof Services)[];

type AssertNever<T extends never> = T;

/**
 * Fails to compile when a `Services` key is neither in {@link PORT_NAMES} nor
 * in {@link DATA_SERVICE_NAMES}.
 */
export type PortsAreExhaustive = AssertNever<
  Exclude<keyof Services, PortName | (typeof DATA_SERVICE_NAMES)[number]>
>;

/** The contract runner for each port, with its exact subject type. */
export interface PortContractRunners {
  readonly createMapAdapter: typeof runMapAdapterContract;
  readonly search: typeof runSearchProviderContract;
  readonly suggestions: typeof runSuggestionProviderContract;
  readonly location: typeof runLocationProviderContract;
  readonly settings: typeof runSettingsStoreContract;
  readonly clipboard: typeof runClipboardContract;
  readonly fileSaver: typeof runFileSaverContract;
  readonly fileOpener: typeof runFileOpenerContract;
  readonly url: typeof runUrlStateContract;
  readonly theme: typeof runThemeSourceContract;
  readonly preferences: typeof runDevicePreferencesContract;
  readonly layers: typeof runLayerCatalogueContract;
  readonly layerSource: typeof runLayerSourceContract;
  readonly routing: typeof runRoutingProviderContract;
  readonly selection: typeof runFeatureSelectionContract;
}

/** What the registry holds for one port. */
export interface PortEntry<K extends PortName> {
  /** Builds the fake for this port. */
  readonly createFake: () => NonNullable<Services[K]>;
  /** Registers the shared contract suite for this port. */
  readonly runContract: PortContractRunners[K];
}

/** One {@link PortEntry} for every port. A missing port is a type error. */
export type PortRegistry = { readonly [K in PortName]: PortEntry<K> };

/**
 * Maps every port to its fake and its contract suite. The coverage test
 * compares this against the keys of `Services`.
 */
export const PORT_REGISTRY: PortRegistry = {
  createMapAdapter: {
    createFake: () => createFakeMapAdapterFactory(),
    runContract: runMapAdapterContract,
  },
  search: {
    createFake: () => new FakeSearchProvider(),
    runContract: runSearchProviderContract,
  },
  suggestions: {
    createFake: () => new FakeSuggestionProvider(),
    runContract: runSuggestionProviderContract,
  },
  location: {
    createFake: () => new FakeLocationProvider(),
    runContract: runLocationProviderContract,
  },
  settings: {
    createFake: () => new MemorySettingsStore(),
    runContract: runSettingsStoreContract,
  },
  clipboard: {
    createFake: () => new FakeClipboard(),
    runContract: runClipboardContract,
  },
  fileSaver: {
    createFake: () => new FakeFileSaver(),
    runContract: runFileSaverContract,
  },
  fileOpener: {
    createFake: () => new FakeFileOpener(),
    runContract: runFileOpenerContract,
  },
  url: {
    createFake: () => new MemoryUrlState(),
    runContract: runUrlStateContract,
  },
  theme: {
    createFake: () => new FakeThemeSource(),
    runContract: runThemeSourceContract,
  },
  preferences: {
    createFake: () => new FakeDevicePreferences(),
    runContract: runDevicePreferencesContract,
  },
  layers: {
    createFake: () => new FakeLayerCatalogue(),
    runContract: runLayerCatalogueContract,
  },
  layerSource: {
    createFake: () => new FakeLayerSource(),
    runContract: runLayerSourceContract,
  },
  routing: {
    createFake: () => new FakeRoutingProvider(),
    runContract: runRoutingProviderContract,
  },
  selection: {
    createFake: () => new MemoryFeatureSelection(),
    runContract: runFeatureSelectionContract,
  },
};
