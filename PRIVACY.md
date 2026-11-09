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
(under the key `karta:theme`), your units, whether the zoom buttons
show, your chosen basemap and where the map was last left. The other keys
start with `karta:`. These stay on your device and are never sent to a server.

## Analytics

This site uses Cloudflare Web Analytics for aggregate page-view counts. It is
cookieless, does not fingerprint visitors, does not track you across sites and stores
no personal data. Requests are made to
`static.cloudflareinsights.com` and `cloudflareinsights.com`.

## Error reporting

If the app hits an unexpected error in your browser, it sends a short
diagnostic report to this site's own server, where it is written to
Cloudflare's operational logs so the fault can be fixed. The report holds the
error message, a stack trace, the page's address without its query or the part
after # (for example `https://karta.timothybrits.co.za/`), and whether it was
an uncaught error or a rejected promise. It never includes the map's position
or yours. No cookies, personal data or persistent identifiers are attached to
the report, and it is not stored in any database. One page load sends at most
five reports, and the same error only once.

## Hosting logs

Cloudflare, as host, may log standard request metadata (IP address, user
agent, timestamp) as part of normal operation. See Cloudflare's own privacy
policy.

## Map tiles and location search

The basemap tile providers, OpenFreeMap and, when you choose the Streets
basemap, the OpenStreetMap Foundation, may log tile requests, including your IP
address, as part of serving the map. This is standard for any web map. When you
search (by pressing Enter or the Search button), your query is sent to
OpenStreetMap's Nominatim geocoding service, which may likewise log the query
and your IP address. Nothing is sent while you type.

## Pin addresses

Dropping a pin sends nothing. A pin's address is looked up only when you press
Look up address on the pin. That sends the pin's position, rounded to about
11 m, to OpenStreetMap's Nominatim service, which may log it with your IP
address.

## Your location

The Locate me button asks your browser for your position only when you press
it. The position is used to show where you are on the map. It is not sent to
this site and is not stored.
