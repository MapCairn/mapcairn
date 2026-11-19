// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useOnline } from "@mapcairn/map";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long the browser's online signal must hold before the person is told it
 * changed. Browsers fire `offline` and `online` for a moment's dropout, and a
 * notice for each would be noise; a change that reverses inside this time is
 * never said.
 */
export const CONNECTION_SETTLE_MS = 1500;

/** What the connection notice says: the device went offline, or is back online. */
export type ConnectionNoticeKind = "offline" | "online";

/** What {@link useConnectionNotice} returns. */
export interface ConnectionNotice {
  /** The notice to show, or null when there is none. */
  readonly notice: ConnectionNoticeKind | null;
  /** Hides the notice. The next change of connection shows a new one. */
  readonly dismiss: () => void;
}

/**
 * The visible notice for the device going offline and coming back. A change
 * counts once it has held for {@link CONNECTION_SETTLE_MS}, so a flickering
 * connection says each real change once. "Back online" is only said after an
 * offline notice, never on first load.
 *
 * @remarks Reads only the browser's own signal (no request is made to test
 *   it), and starts as nothing so the first render matches the server's, where
 *   there is no signal. A page that opens offline says so after that delay.
 */
export function useConnectionNotice(): ConnectionNotice {
  const online = useOnline();
  const [notice, setNotice] = useState<ConnectionNoticeKind | null>(null);
  const said = useRef(true);

  useEffect(() => {
    if (online === said.current) {
      return;
    }
    const timer = setTimeout(() => {
      said.current = online;
      setNotice(online ? "online" : "offline");
    }, CONNECTION_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [online]);

  const dismiss = useCallback(() => setNotice(null), []);
  return { notice, dismiss };
}
