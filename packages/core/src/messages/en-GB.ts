// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageKey } from "../ports/messages";

/**
 * The SDK's shipped default catalogue: British English, the source language.
 * Every `MessageKey` has a value here; `packages/core/src/lint` fails the
 * build when one is missing or when a value's placeholders do not match its
 * `MessageParams` entry. Seeded verbatim from the Settings panel's existing
 * inline copy, so moving the panel to keys changes no visible text.
 *
 * A key used with `plural` carries two forms separated by `|`: the form for
 * `Intl.PluralRules`'s "one" category first, the form for every other
 * category second. English has only "one" and "other", so two forms are
 * enough.
 */
export const EN_GB_CATALOGUE: Record<MessageKey, string> = {
  "settings.title": "Settings",
  "settings.theme.label": "Theme",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.units.label": "Units",
  "settings.units.metric": "Metric",
  "settings.units.imperial": "Imperial",
  "settings.mapShape.label": "Map shape",
  "settings.mapShape.flat": "Flat",
  "settings.mapShape.globe": "Globe",
  "settings.zoomButtons.label": "Show zoom buttons",
  "settings.zoomButtons.description":
    "On by default with a mouse, off on touch screens.",
  "settings.saveData.label": "Save data",
  "settings.saveData.description":
    "Shows map names instead of previews and leaves out heavy map layers.",
  "settings.notSaved": "Changes will not be remembered on this device.",
  "settings.privacy.heading": "Privacy",
  "settings.privacy.link": "Read the privacy policy",
  "common.itemCount": "{count} item|{count} items",
  "settings.language.label": "Language",
  "settings.language.auto": "Automatic",
};
