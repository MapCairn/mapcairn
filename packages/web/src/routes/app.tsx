// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { languageDirection, resolveLanguage } from "@mapcairn/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
  useLanguageLoad,
  useMessages,
  usePreferences,
  useServices,
  useSettings,
} from "@mapcairn/map";
import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { DocumentTitle } from "../app/DocumentTitle";
import { createServices } from "../composition/createServices";

/**
 * Keeps `<html lang dir>` on the selected language. While its catalogue loads,
 * the matching pre-paint language stays in place; a failed load returns to the
 * active catalogue's language.
 */
function DocumentLanguage() {
  const { language } = useMessages();
  const { languages } = useServices();
  const { settings } = useSettings();
  const { languages: browserLanguages } = usePreferences();
  const failed = useLanguageLoad()?.failed;
  const wanted =
    languages === undefined
      ? language
      : resolveLanguage(
          settings.language,
          languages.languages.map(({ tag }) => tag),
          browserLanguages,
          languages.defaultLanguage,
        );
  useEffect(() => {
    if (
      wanted !== language &&
      document.documentElement.lang === wanted &&
      failed !== wanted
    ) {
      return;
    }
    document.documentElement.lang = language;
    document.documentElement.dir = languageDirection(
      language,
      languages?.languages,
    );
  }, [language, languages, wanted, failed]);
  return null;
}

/**
 * React Router route module export: the layout around the pages that use the
 * app's services, the playground at `/map` and the privacy page. It builds
 * the services once per app instance (once per request on the server, once
 * in the browser) and mounts the providers they need: services, the one
 * announcer and tooltips. It also keeps the document's `lang` and the tab's
 * title in step with the active language. The product page at `/` sits
 * outside it, so it loads none of this: no adapter, no layer definition and
 * no engine styles.
 *
 * @remarks `createServices` is safe on the server: adapters touch no browser
 *   API until used. Their values differ between server and browser (stored
 *   settings, device preferences), so nothing rendered from them is in the
 *   server HTML; the map route mounts the map after hydration.
 */
export default function AppLayout() {
  const [services] = useState(() => createServices());
  return (
    <ServicesProvider services={services}>
      <DocumentLanguage />
      <DocumentTitle />
      <LiveRegionProvider>
        <TooltipProvider>
          <Outlet />
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}
