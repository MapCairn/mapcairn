// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
  useMessages,
} from "@mapcairn/map";
import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { DocumentTitle } from "../app/DocumentTitle";
import { createServices } from "../composition/createServices";

/**
 * Keeps `<html lang>` on the language the interface speaks. The pre-paint
 * script sets it from the stored choice before first paint; this covers the
 * browser's own languages and a choice made later.
 */
function DocumentLanguage() {
  const { language } = useMessages();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
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
