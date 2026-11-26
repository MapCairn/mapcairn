// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { languageDirection } from "@mapcairn/core";
import { useLanguages, useMessages } from "@mapcairn/map";
import { useEffect } from "react";

/** What {@link ContainerLanguage} needs from the mount. */
export interface ContainerLanguageProps {
  /** The element that holds the map. */
  readonly element: HTMLElement;
  /** Whether the map may write `dir`. False when the page set its own on the element. */
  readonly writeDirection: boolean;
}

/**
 * Keeps `lang` and `dir` on the map's element in step with the language the
 * interface speaks, from the start and after each switch, so a screen reader
 * uses the right voice and a right-to-left language lays out as one. `lang` is
 * put back as the page had it, and `dir` removed, when the map is destroyed.
 * It draws nothing.
 */
export function ContainerLanguage({
  element,
  writeDirection,
}: ContainerLanguageProps) {
  const { language } = useMessages();
  const offered = useLanguages()?.languages.find(
    (option) => option.tag === language,
  );
  const direction = offered?.direction ?? languageDirection(language);

  useEffect(() => {
    const before = element.getAttribute("lang");
    return () => {
      if (before === null) {
        element.removeAttribute("lang");
      } else {
        element.setAttribute("lang", before);
      }
    };
  }, [element]);
  useEffect(() => {
    element.setAttribute("lang", language);
  }, [element, language]);

  useEffect(() => {
    if (!writeDirection) {
      return;
    }
    element.setAttribute("dir", direction);
    return () => element.removeAttribute("dir");
  }, [element, writeDirection, direction]);
  return null;
}
