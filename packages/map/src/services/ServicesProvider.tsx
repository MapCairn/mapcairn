import type { Services } from "@mapcairn/core";
import { createContext, type ReactNode, useContext } from "react";

const ServicesContext = createContext<Services | null>(null);

/** Props for {@link ServicesProvider}. */
export interface ServicesProviderProps {
  /** Built once by the composition root, or by `createFakeServices` in tests. */
  readonly services: Services;
  readonly children: ReactNode;
}

/**
 * Makes the app's services available to every component below it. This is the
 * only way components reach adapters, browser APIs or map engines, so tests can
 * swap in fakes by wrapping a tree in this provider.
 */
export function ServicesProvider({
  services,
  children,
}: ServicesProviderProps) {
  return (
    <ServicesContext.Provider value={services}>
      {children}
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
