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
 * The private elements as a React part sees them, loading them on the client.
 * A server and the hydrating render see them as loading, so both draw the same
 * markup. Once they are loaded, a part that mounts gets their names in its
 * first render.
 */
export function usePrivateElements(): DefinitionState<PrivateElementTags> {
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
