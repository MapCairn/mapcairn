// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useEffect, useState } from "react";

/**
 * How long a map view that is holding itself back waits for the private
 * elements before it says it could not start: long enough for their one small
 * file on a slow mobile link beside everything else a first visit loads, and
 * short enough that a request that never settles does not leave the page
 * waiting in silence.
 */
export const ELEMENTS_LOAD_TIMEOUT_MS = 30_000;

/**
 * Whether a wait has lasted `limitMs`. Once true it stays true for the
 * component, so what it has said about the wait stays true if the thing waited
 * for arrives later.
 *
 * @param waiting Whether the wait is on. No time is counted while it is off.
 */
export function useWaitedTooLong(waiting: boolean, limitMs: number): boolean {
  const [tooLong, setTooLong] = useState(false);
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setTimeout(() => {
      console.error(
        `MapCairn gave up on part of its interface after ${limitMs} ms.`,
      );
      setTooLong(true);
    }, limitMs);
    return () => clearTimeout(timer);
  }, [waiting, limitMs]);
  return tooLong;
}
