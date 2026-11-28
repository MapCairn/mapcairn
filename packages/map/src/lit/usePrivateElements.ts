// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useEffect, useSyncExternalStore } from "react";
import type { DefinitionState } from "./lazyDefinition";
import { type PrivateElementTags, privateElements } from "./privateElements";

/** What a server, and the first render that hydrates its markup, are given. */
const ON_THE_SERVER: DefinitionState<PrivateElementTags> = {
  status: "loading",
};

const onTheServer = () => ON_THE_SERVER;

/**
 * Where the private elements stand, as a React part sees them, loading them on
 * the client the first time any part asks. A server and the render that
 * hydrates its markup see them as loading, so both draw the same markup.
 * `MapView` waits for them before it draws, so a part below it is given their
 * names in its first render.
 */
export function useLoadedPrivateElements(): DefinitionState<PrivateElementTags> {
  const state = useSyncExternalStore(
    privateElements.subscribe,
    privateElements.state,
    onTheServer,
  );
  useEffect(() => {
    void privateElements.define();
  }, []);
  return state;
}
