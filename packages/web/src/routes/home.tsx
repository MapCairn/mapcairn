import { SkipLink, VisuallyHidden } from "@karta/map";
import type { LinksFunction } from "react-router";
import { App } from "../App";
import { ClientOnly } from "../app/ClientOnly";
import { MAP_REGION_ID } from "../app/initialView";
import { mapPlaceholder } from "../app/shell.css";
import { SITE_URL } from "../constants/siteConfig";

/** React Router route module export: the `/` route's canonical `<link>`. */
export const links: LinksFunction = () => [
  { rel: "canonical", href: SITE_URL },
];

/**
 * React Router route module export: the map page.
 *
 * @remarks The server renders a static shell only: the skip link (the first
 *   focusable element), the page's hidden h1 and a `main` in the map's
 *   background colour. The app mounts after hydration, because it depends on
 *   stored settings and device preferences the server cannot know; rendering
 *   it on the server would make the two disagree. Its own `main` (inside
 *   `MapChrome`) then replaces the placeholder.
 */
export default function HomeRoute() {
  return (
    <>
      <SkipLink targetId={MAP_REGION_ID} />
      <VisuallyHidden as="h1">Karta</VisuallyHidden>
      <ClientOnly
        fallback={
          <main
            className={mapPlaceholder}
            aria-busy="true"
            data-testid="map-placeholder"
          >
            <VisuallyHidden>Loading the map</VisuallyHidden>
          </main>
        }
      >
        <App />
      </ClientOnly>
    </>
  );
}
