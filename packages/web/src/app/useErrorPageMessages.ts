// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { languageDirection, type MessageCatalogue } from "@mapcairn/core";
import { useEffect, useState } from "react";
import { resolveDeviceLanguage } from "../composition/storedLanguage";
import {
  ENGLISH,
  loadLanguage,
  OFFERED_LANGUAGES,
} from "../i18n/hostLanguages";

/**
 * The messages for the language this device wants, or English when it cannot
 * be worked out or loaded.
 */
async function loadWantedOrEnglish(): Promise<MessageCatalogue> {
  try {
    return await loadLanguage(resolveDeviceLanguage());
  } catch (error) {
    console.warn("Could not load the visitor's language.", error);
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
 *   storage and the browser never throw, and resolving the language and
 *   loading it are both caught. It imports no services provider and no map
 *   code.
 */
export function useErrorPageMessages(): MessageCatalogue {
  const [messages, setMessages] = useState<MessageCatalogue>(ENGLISH);
  useEffect(() => {
    let current = true;
    void loadWantedOrEnglish().then((loaded) => {
      if (current) {
        setMessages(loaded);
        document.documentElement.lang = loaded.language;
        document.documentElement.dir = languageDirection(
          loaded.language,
          OFFERED_LANGUAGES,
        );
      }
    });
    return () => {
      current = false;
    };
  }, []);
  return messages;
}
