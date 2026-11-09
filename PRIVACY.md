# Privacy policy

_Last updated: 2026-11-09_

_This mirrors the policy on the site at `/privacy`
(`packages/web/src/app/PrivacyPage.tsx`). Keep both in sync when either
changes._

Karta has no user accounts, no forms and no server-side database of visitor
data. The site stores or sends only the following.

## Cookies

The site sets no cookies. Your settings are kept in local storage on your
device instead, as described below.

## Local storage

Your browser's `localStorage` keeps your settings: your light or dark theme
(under the key `buffer-zones-theme`), your units, whether the zoom buttons
show, your chosen basemap and where the map was last left. The other keys
start with `karta:`. These stay on your device and are never sent to a server.

## Analytics

This site uses Cloudflare Web Analytics for aggregate page-view counts. It is
cookieless, does not fingerprint visitors, does not track you across sites,
and stores no personal data. Requests are made to
`static.cloudflareinsights.com` and `cloudflareinsights.com`.

## Error reporting

If the app hits an unexpected error in your browser, it sends a short
diagnostic report (the error message, a stack trace and the page URL) to this
site's own server, where it is written to Cloudflare's operational logs so the
fault can be fixed. No cookies, personal data or persistent identifiers are
attached to the report, and it is not stored in any database.

## Hosting logs

Cloudflare, as host, may log standard request metadata (IP address, user
agent, timestamp) as part of normal operation. See Cloudflare's own privacy
policy.

## Map tiles and location search

The basemap tile providers (OpenFreeMap and Esri) may log tile requests,
including your IP address, as part of serving imagery. Location search
queries go to OpenStreetMap's Nominatim geocoding service, which may also log
the query and your IP address. This is standard for any web map.

## Your location

The Locate me button asks your browser for your position only when you press
it. The position is used to show where you are on the map. It is not sent to
this site and is not stored.
