// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useEffect, useState } from "react";

/**
 * How long a lookup may run before the interface says it is waiting. An
 * answer that comes sooner shows nothing, so a quick tap does not flash a
 * line.
 */
export const IDENTIFY_FEEDBACK_MS = 400;

/**
 * Whether to show the "Looking up what is here" line: true once `identifying`
 * (see `DataLayers.identifying`) has been true for {@link IDENTIFY_FEEDBACK_MS},
 * and false again the moment it ends. The line is for the eye only. The
 * lookup's result is said once, when it arrives, so nothing is announced
 * while waiting: a message at the delay would be coalesced with the result.
 */
export function useIdentifyFeedback(identifying: boolean): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!identifying) {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), IDENTIFY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [identifying]);
  return identifying && late;
}
