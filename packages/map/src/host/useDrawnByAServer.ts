// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useState, useSyncExternalStore } from "react";

const subscribeToNothing = () => () => undefined;
const inABrowser = () => false;
const onAServer = () => true;

/**
 * Whether a component first rendered on a server: true on the server, in the
 * render that hydrates its markup, and in every render of that component after
 * it. False for a component mounted in the browser, even one mounted on a page
 * that was server-rendered. React reads the server snapshot only on those first
 * two renders, and the first answer is kept.
 */
export function useDrawnByAServer(): boolean {
  const server = useSyncExternalStore(
    subscribeToNothing,
    inABrowser,
    onAServer,
  );
  const [drawnByAServer] = useState(server);
  return drawnByAServer;
}
