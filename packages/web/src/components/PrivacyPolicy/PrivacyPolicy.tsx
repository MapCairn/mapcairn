import { THEME_STORAGE_KEY } from "../../constants/themeConfig";
import { visuallyHidden } from "../../shared.css";
import * as styles from "./PrivacyPolicy.css";

/** ISO date this policy's content was last reviewed for accuracy. */
const LAST_UPDATED = "2026-11-09";

/** This page's title, shared with `routes/privacy.tsx`'s `<title>` so the two can't drift apart. */
export const PRIVACY_POLICY_TITLE = "Privacy policy";

/**
 * The site's privacy policy page content.
 * @remarks Reads `THEME_STORAGE_KEY` from the module that actually sets it
 *   rather than repeating the string as a literal, so this copy can't
 *   silently drift out of sync with what the app actually stores. Content
 *   here must stay in sync with the root `PRIVACY.md`, which mirrors it for
 *   readers browsing the repository directly.
 */
export function PrivacyPolicy() {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{PRIVACY_POLICY_TITLE}</h1>
      <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

      <p className={styles.body}>
        Karta is a static-content map: there are no user accounts, no forms, and
        no server-side database of visitor data. The site stores or sends only
        the following.
      </p>

      <h2 className={styles.sectionTitle}>Cookies</h2>
      <p className={styles.body}>
        The site sets no cookies. Preferences such as your theme are kept in
        local storage on your device instead, as described below.
      </p>

      <h2 className={styles.sectionTitle}>Local storage</h2>
      <p className={styles.body}>
        Your browser's <code>localStorage</code>, under the key{" "}
        <code>{THEME_STORAGE_KEY}</code>, stores your light/dark theme
        preference. This stays on your device and is never sent to any server.
      </p>

      <h2 className={styles.sectionTitle}>Analytics</h2>
      <p className={styles.body}>
        This site uses Cloudflare Web Analytics for aggregate page-view counts.
        It is cookieless, does not fingerprint visitors, does not track you
        across sites, and stores no personal data. Requests are made to{" "}
        <code>static.cloudflareinsights.com</code> and{" "}
        <code>cloudflareinsights.com</code>.
      </p>

      <h2 className={styles.sectionTitle}>Error reporting</h2>
      <p className={styles.body}>
        If the app hits an unexpected error in your browser, it sends a short
        diagnostic report (the error message, a stack trace and the page URL) to
        this site's own server, where it is written to Cloudflare's operational
        logs so the fault can be fixed. No cookies, personal data, or persistent
        identifiers are attached to this report, and it is not stored in any
        database.
      </p>

      <h2 className={styles.sectionTitle}>Hosting logs</h2>
      <p className={styles.body}>
        Cloudflare, as host, may log standard request metadata (IP address, user
        agent, timestamp) as part of normal operation. See{" "}
        <a
          href="https://www.cloudflare.com/privacypolicy/"
          target="_blank"
          rel="noreferrer"
        >
          Cloudflare's own privacy policy
          <span className={visuallyHidden}> (opens in a new tab)</span>
        </a>
        .
      </p>

      <h2 className={styles.sectionTitle}>Map tiles and location search</h2>
      <p className={styles.body}>
        The basemap tile providers, OpenFreeMap and Esri, may log tile requests,
        including IP address, as part of serving imagery. This is standard for
        any web map. Typing in the search box sends your query to
        OpenStreetMap's Nominatim geocoding service, which may likewise log the
        query and your IP address.
      </p>

      <h2 className={styles.sectionTitle}>No location tracking</h2>
      <p className={styles.body}>
        The browser's geolocation API is not used by this site, and is disabled
        at the HTTP-header level via a <code>Permissions-Policy</code> header.
      </p>

      <a className={styles.backLink} href="/">
        Back to the map
      </a>
    </main>
  );
}
