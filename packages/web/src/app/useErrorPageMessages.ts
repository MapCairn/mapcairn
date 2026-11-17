// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type MessageCatalogue,
} from "@mapcairn/core";
import { useEffect, useState } from "react";
import { resolveDeviceLanguage } from "../composition/storedLanguage";
import { DEFAULT_LANGUAGE, loadLanguage } from "../i18n/hostLanguages";

/** What the page says until a language has loaded, and when none can. */
const ENGLISH = createMessageCatalogue(
  DEFAULT_LANGUAGE,
  EN_GB_CATALOGUE,
  EN_GB_CATALOGUE,
);

/** The messages for `tag`, or English when they cannot be loaded. */
async function loadOrEnglish(tag: string): Promise<MessageCatalogue> {
  try {
    return await loadLanguage(tag);
  } catch (error) {
    console.warn(`Could not load the "${tag}" language.`, error);
    return ENGLISH;
  }
}

/**
 * The catalogue the root error boundary speaks, chosen without the services
 * the failed route would have supplied. It renders English first, so the
 * server's page and the browser's first render match, then resolves the
 * stored language (else the browser's) the way the app does, loads it and
 * sets `<html lang>` to the language the page ends up in. A blocked or
 * garbled stored value, or an Afrikaans load that fails, leaves English.
 *
 * @remarks Nothing here can throw into the boundary: the adapters that read
 *   storage and the browser never throw and a failed load is caught. It imports no
 *   services provider and no map code.
 */
export function useErrorPageMessages(): MessageCatalogue {
  const [messages, setMessages] = useState<MessageCatalogue>(ENGLISH);
  useEffect(() => {
    let current = true;
    void loadOrEnglish(resolveDeviceLanguage()).then((loaded) => {
      if (current) {
        setMessages(loaded);
        document.documentElement.lang = loaded.language;
      }
    });
    return () => {
      current = false;
    };
  }, []);
  return messages;
}
