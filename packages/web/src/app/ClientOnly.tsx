// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type ReactNode, useSyncExternalStore } from "react";

/** Nothing to subscribe to: the answer never changes after hydration. */
function subscribe(): () => void {
  return () => undefined;
}

const onClient = () => true;
const onServer = () => false;

/** Props for {@link ClientOnly}. */
export interface ClientOnlyProps {
  /** Rendered on the server and during hydration. Must not depend on the browser. */
  readonly fallback: ReactNode;
  /** Rendered once the page has hydrated. */
  readonly children: ReactNode;
}

/**
 * Renders `fallback` on the server and while hydrating, and `children` right
 * after hydration, so markup that depends on the browser (stored settings,
 * device preferences, the map) never causes a hydration mismatch.
 *
 * @remarks `useSyncExternalStore` returns the server snapshot (false) while
 *   hydrating and the client snapshot (true) on the render after it. A tree
 *   mounted after hydration renders `children` straight away.
 */
export function ClientOnly({ fallback, children }: ClientOnlyProps) {
  const hydrated = useSyncExternalStore(subscribe, onClient, onServer);
  return hydrated ? children : fallback;
}
