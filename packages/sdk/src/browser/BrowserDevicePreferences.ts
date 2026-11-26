// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { DevicePreferences, DevicePreferencesValue } from "@mapcairn/core";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

function sameValue(
  a: DevicePreferencesValue,
  b: DevicePreferencesValue,
): boolean {
  return (
    a.reducedMotion === b.reducedMotion &&
    a.finePointer === b.finePointer &&
    a.online === b.online &&
    a.languages.length === b.languages.length &&
    a.languages.every((language, index) => language === b.languages[index])
  );
}

/**
 * Reports reduced motion, a fine pointer, the browser's languages and
 * whether it is online, and tells a subscriber when a media query or the
 * network state changes. `get` reads fresh and answers the same object until
 * something changes, because the interface reads it as a store snapshot.
 */
export class BrowserDevicePreferences implements DevicePreferences {
  #value: DevicePreferencesValue | undefined;

  get(): DevicePreferencesValue {
    const next: DevicePreferencesValue = {
      reducedMotion: window.matchMedia(REDUCED_MOTION_QUERY).matches,
      finePointer: window.matchMedia(FINE_POINTER_QUERY).matches,
      languages: [...navigator.languages],
      online: navigator.onLine,
    };
    if (this.#value === undefined || !sameValue(this.#value, next)) {
      this.#value = next;
    }
    return this.#value;
  }

  subscribe(listener: (value: DevicePreferencesValue) => void): () => void {
    const queries = [REDUCED_MOTION_QUERY, FINE_POINTER_QUERY].map((query) =>
      window.matchMedia(query),
    );
    const onChange = () => listener(this.get());
    for (const query of queries) {
      query.addEventListener("change", onChange);
    }
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      for (const query of queries) {
        query.removeEventListener("change", onChange);
      }
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }
}
