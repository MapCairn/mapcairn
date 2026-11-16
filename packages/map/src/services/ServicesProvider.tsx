// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Services } from "@mapcairn/core";
import { createContext, type ReactNode, useContext } from "react";
import { ActiveMessagesProvider } from "./activeMessages";
import { BasemapAvailabilityProvider } from "./basemapAvailability";

const ServicesContext = createContext<Services | null>(null);

/** Props for {@link ServicesProvider}. */
export interface ServicesProviderProps {
  /** Built once by the composition root, or by `createFakeServices` in tests. */
  readonly services: Services;
  readonly children: ReactNode;
}

/**
 * Makes the app's services available to every component below it. This is the
 * only way components reach adapters, browser services or map engines, so tests
 * can swap in fakes by wrapping a tree in this provider. It also keeps which
 * basemaps are not working (see `useBasemapAvailability`) and the active
 * message catalogue (see `useMessages`).
 */
export function ServicesProvider({
  services,
  children,
}: ServicesProviderProps) {
  return (
    <ServicesContext.Provider value={services}>
      <ActiveMessagesProvider services={services}>
        <BasemapAvailabilityProvider>{children}</BasemapAvailabilityProvider>
      </ActiveMessagesProvider>
    </ServicesContext.Provider>
  );
}

/**
 * Returns the services. Throws when called outside a {@link ServicesProvider},
 * because a missing provider is a wiring bug, not a runtime condition.
 */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error("useServices must be used inside a ServicesProvider.");
  }
  return services;
}

/**
 * Returns the services, or null outside a {@link ServicesProvider}. For the
 * few pieces, such as the live regions, that must still work when a test or
 * a host mounts them without one.
 */
export function useOptionalServices(): Services | null {
  return useContext(ServicesContext);
}
