// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LanguageOption } from "@mapcairn/core";

/** The language the server renders and the one used when nothing else matches. */
export const DEFAULT_LANGUAGE = "en-GB";

/** The reference host's languages, in switcher order. */
export const OFFERED_LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { tag: DEFAULT_LANGUAGE, label: "English" },
  { tag: "af", label: "Afrikaans" },
];
