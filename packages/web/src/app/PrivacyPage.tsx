import { THEME_STORAGE_KEY } from "@karta/core";
import { VisuallyHidden } from "@karta/map";
import { SITE_URL } from "../constants/siteConfig";
import * as styles from "./PrivacyPage.css";

/** ISO date this policy's content was last reviewed for accuracy. */
const LAST_UPDATED = "2026-11-09";

/** The page's title, shared with the route's `<title>` so the two cannot drift apart. */
export const PRIVACY_POLICY_TITLE = "Privacy policy";

/**
 * The site's privacy policy.
 * @remarks Reads `THEME_STORAGE_KEY` from `@karta/core`, which the settings store and the pre-paint theme script also use, so this
 *   copy cannot drift from the key the app really uses. The content must stay
 *   in step with the root `PRIVACY.md`, which mirrors it for readers of the
 *   repository.
 */
export function PrivacyPage() {
  return (
    <div className={styles.scroller}>
      <main className={styles.page} data-testid="privacy-page">
        <h1 className={styles.heading}>{PRIVACY_POLICY_TITLE}</h1>
        <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

        <p className={styles.body}>
          Karta has no user accounts, no forms and no server-side database of
          visitor data. The site stores or sends only the following.
        </p>

        <h2 className={styles.sectionTitle}>Cookies</h2>
        <p className={styles.body}>
          The site sets no cookies. Your settings are kept in local storage on
          your device instead, as described below.
        </p>

        <h2 className={styles.sectionTitle}>Local storage</h2>
        <p className={styles.body}>
          Your browser's <code>localStorage</code> keeps your settings: your
          light or dark theme (under the key <code>{THEME_STORAGE_KEY}</code>),
          your units, whether the zoom buttons show, your chosen basemap and
          where the map was last left. The other keys start with{" "}
          <code>karta:</code>. These stay on your device and are never sent to a
          server.
        </p>

        <h2 className={styles.sectionTitle}>Analytics</h2>
        <p className={styles.body}>
          This site uses Cloudflare Web Analytics for aggregate page-view
          counts. It is cookieless, does not fingerprint visitors, does not
          track you across sites and stores no personal data. Requests are made
          to <code>static.cloudflareinsights.com</code> and{" "}
          <code>cloudflareinsights.com</code>.
        </p>

        <h2 className={styles.sectionTitle}>Error reporting</h2>
        <p className={styles.body}>
          If the app hits an unexpected error in your browser, it sends a short
          diagnostic report to this site's own server, where it is written to
          Cloudflare's operational logs so the fault can be fixed. The report
          holds the error message, a stack trace, the page's address without its
          query or the part after # (for example <code>{SITE_URL}/</code>), and
          whether it was an uncaught error or a rejected promise. It never
          includes the map's position or yours. No cookies, personal data or
          persistent identifiers are attached to the report, and it is not
          stored in any database. One page load sends at most five reports, and
          the same error only once.
        </p>

        <h2 className={styles.sectionTitle}>Hosting logs</h2>
        <p className={styles.body}>
          Cloudflare, as host, may log standard request metadata (IP address,
          user agent, timestamp) as part of normal operation. See{" "}
          <a
            className={styles.link}
            href="https://www.cloudflare.com/privacypolicy/"
            target="_blank"
            rel="noreferrer"
          >
            Cloudflare's own privacy policy
            <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
          </a>
          .
        </p>

        <h2 className={styles.sectionTitle}>Map tiles and location search</h2>
        <p className={styles.body}>
          The basemap tile providers, OpenFreeMap and, when you choose the
          Streets basemap, the OpenStreetMap Foundation, may log tile requests,
          including your IP address, as part of serving the map. This is
          standard for any web map. When you search (by pressing Enter or the
          Search button), your query is sent to OpenStreetMap's Nominatim
          geocoding service, which may likewise log the query and your IP
          address. Nothing is sent while you type.
        </p>

        <h2 className={styles.sectionTitle}>Pin addresses</h2>
        <p className={styles.body}>
          Dropping a pin sends nothing. A pin's address is looked up only when
          you press Look up address on the pin. That sends the pin's position,
          rounded to about 11 m, to OpenStreetMap's Nominatim service, which may
          log it with your IP address.
        </p>

        <h2 className={styles.sectionTitle}>Your location</h2>
        <p className={styles.body}>
          The Locate me button asks your browser for your position only when you
          press it. The position is used to show where you are on the map. It is
          not sent to this site and is not stored.
        </p>

        <a className={styles.link} href="/">
          Back to the map
        </a>
      </main>
    </div>
  );
}
