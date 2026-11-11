# Privacy policy

_Last updated: 2026-11-11_

_This mirrors the policy on the site at `/privacy`
(`packages/web/src/app/PrivacyPage.tsx`). Keep both in sync when either
changes._

MapCairn has no user accounts, no forms and no server-side database of visitor
data. The site stores or sends only the following.

## Cookies

The site sets no cookies. Your settings are kept in local storage on your
device instead, as described below.

## Local storage

Your browser's `localStorage` keeps your settings: your light or dark theme
(under the key `mapcairn:theme`), your units, whether the zoom buttons
show, whether Save data is on, your chosen basemap and where the map was last
left. The other keys start with `mapcairn:`. These stay on your device and are
never sent to a server. Where your browser reports a data saver or a very slow
connection, the page reads that locally to choose the default for Save data.
Nothing about it is sent anywhere.

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
after # (for example `https://mapcairn.timothybrits.co.za/`), and whether it was
an uncaught error or a rejected promise. It never includes the map's position
or yours. No cookies, personal data or persistent identifiers are attached to
the report, and it is not stored in any database. One page load sends at most
five reports, and the same error only once.

## Hosting logs

Cloudflare, as host, may log standard request metadata (IP address, user
agent, timestamp) as part of normal operation. See Cloudflare's own privacy
policy.

## Map tiles and location search

The basemap tile providers, OpenFreeMap, VersaTiles when you choose the
Colorful basemap, the OpenStreetMap Foundation when you choose the Streets
basemap, and OpenStreetMap France when you choose the Topographic basemap, may log tile requests, including your IP address, as part of serving
the map. This is standard for any web map. Your browser makes those requests
itself: they carry your IP address, its usual request headers (such as its user
agent) and this site's address as the referrer, and nothing this site has stored
about you. VersaTiles says it logs requests in anonymised form and uses the logs
only to track down faults and detect misuse. When you
search (by pressing Enter or the Search button), your query is sent to
OpenStreetMap's Nominatim geocoding service, which may likewise log the query
and your IP address. Nothing is sent while you type.

## Data layers

Every data layer is off until you turn it on, and nothing is requested before
that. Turning a layer on, changing its controls or pressing Try again sends a
request from your browser straight to that layer's provider, which may log it
with your IP address: the US Geological Survey (USGS) for earthquakes, NASA's
Global Imagery Browse Services for satellite imagery, rainfall and fire
hotspots, the Global Disaster Alert and Coordination System (GDACS) for fire,
flood, tropical cyclone, volcano and drought alerts, and Copernicus (the Global
Flood Awareness System) for the flood hazard map, and the jsDelivr content
delivery network for the country boundaries. Show affected area sends one more
request to GDACS for that event only. Tile layers request images for the part
of the map you are looking at, so the provider can tell roughly where you are
looking. Nothing passes through this site, and nothing is stored beyond the
page you have open. The layers you turn on are written into the page address
so a link can be shared; they are not sent anywhere else. Opening a link that
has layers turned on requests those layers straight away, because the link
turns them on.

## Pin addresses

Dropping a pin sends nothing. A pin's address is looked up only when you press
Look up address on the pin. That sends the pin's position, rounded to about
11 m, to OpenStreetMap's Nominatim service, which may log it with your IP
address.

## Routes and travel-time areas

When you ask for a route or a travel-time area, the request goes to the public
Valhalla routing service at valhalla1.openstreetmap.de, run by the FOSSGIS
community and built on OpenStreetMap data. It sends the route's coordinates
(its stops, or the origin of a travel-time area) and the travel mode, and the
server may log them with your IP address. Nothing is sent before you ask.
MapCairn stores nothing about the request, and the results are not saved or put in
the page address.

## Your location

The Locate me button asks your browser for your position only when you press
it. The position is used to show where you are on the map. It is not sent to
this site and is not stored.

## Contact

For a question or concern about privacy, write to mapcairn@timothybrits.co.za, or open an issue on [GitHub](https://github.com/MapCairn/mapcairn/issues).
