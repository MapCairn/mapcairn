import { FakeClipboard } from "../fakes/FakeClipboard";
import { FakeDevicePreferences } from "../fakes/FakeDevicePreferences";
import { FakeLayerSource } from "../fakes/FakeLayerSource";
import { FakeLocationProvider } from "../fakes/FakeLocationProvider";
import { createFakeMapAdapterFactory } from "../fakes/FakeMapAdapter";
import { FakeSearchProvider } from "../fakes/FakeSearchProvider";
import { FakeThemeSource } from "../fakes/FakeThemeSource";
import { MemorySettingsStore } from "../fakes/MemorySettingsStore";
import { MemoryUrlState } from "../fakes/MemoryUrlState";
import { StaticLayerRegistry } from "../fakes/StaticLayerRegistry";
import type { Services } from "../ports/services";
import { runClipboardContract } from "./clipboard.contract";
import { runDevicePreferencesContract } from "./devicePreferences.contract";
import { runLayerRegistryContract } from "./layerRegistry.contract";
import { runLayerSourceContract } from "./layerSource.contract";
import { runLocationProviderContract } from "./locationProvider.contract";
import { runMapAdapterContract } from "./mapAdapter.contract";
import { runSearchProviderContract } from "./searchProvider.contract";
import { runSettingsStoreContract } from "./settingsStore.contract";
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
  "location",
  "settings",
  "clipboard",
  "url",
  "theme",
  "preferences",
  "layers",
  "layerSource",
] as const satisfies readonly (keyof Services)[];

/** The name of one port, as it appears on `Services`. */
export type PortName = (typeof PORT_NAMES)[number];

type AssertNever<T extends never> = T;

/** Fails to compile when a `Services` key is missing from {@link PORT_NAMES}. */
export type PortsAreExhaustive = AssertNever<Exclude<keyof Services, PortName>>;

/** The contract runner for each port, with its exact subject type. */
export interface PortContractRunners {
  readonly createMapAdapter: typeof runMapAdapterContract;
  readonly search: typeof runSearchProviderContract;
  readonly location: typeof runLocationProviderContract;
  readonly settings: typeof runSettingsStoreContract;
  readonly clipboard: typeof runClipboardContract;
  readonly url: typeof runUrlStateContract;
  readonly theme: typeof runThemeSourceContract;
  readonly preferences: typeof runDevicePreferencesContract;
  readonly layers: typeof runLayerRegistryContract;
  readonly layerSource: typeof runLayerSourceContract;
}

/** What the registry holds for one port. */
export interface PortEntry<K extends PortName> {
  /** Builds the fake for this port. */
  readonly createFake: () => Services[K];
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
    createFake: () => new StaticLayerRegistry(),
    runContract: runLayerRegistryContract,
  },
  layerSource: {
    createFake: () => new FakeLayerSource(),
    runContract: runLayerSourceContract,
  },
};
