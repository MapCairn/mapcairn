// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { resolveLanguage } from "@mapcairn/core";
import { BrowserDevicePreferences } from "../adapters/preferences/BrowserDevicePreferences";
import { LocalStorageSettingsStore } from "../adapters/settings/LocalStorageSettingsStore";
import { DEFAULT_LANGUAGE, OFFERED_LANGUAGE_TAGS } from "../i18n/hostLanguages";

/**
 * The language the host should speak on this device, one it offers: the
 * stored choice, else the browser's languages, else the default.
 *
 * @remarks For code that runs outside `createServices`, such as the root error
 *   boundary, which replaces the route that supplies the services. The two
 *   adapters it reads through never throw: blocked storage, a garbled value
 *   and unreadable browser languages all leave the default.
 */
export function resolveDeviceLanguage(): string {
  const { language } = new LocalStorageSettingsStore({
    events: undefined,
  }).get();
  const { languages } = new BrowserDevicePreferences().get();
  return resolveLanguage(
    language,
    OFFERED_LANGUAGE_TAGS,
    languages,
    DEFAULT_LANGUAGE,
  );
}
