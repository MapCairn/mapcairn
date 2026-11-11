# 0007: Half-hourly rainfall and a date and time control

Status: in progress. Tracking issue: [#2](https://github.com/MapCairn/mapcairn/issues/2).

## Goal

Offer NASA's 30-minute IMERG rainfall as a layer beside the daily one, so a visitor can see rain from about six hours ago rather than three days ago. GIBS names each 30-minute image by a UTC timestamp, so the layer system needs a control that picks a date and a half hour, offers only the times the provider has, and says in words which half hour is shown.

## Ground rules

- The control is a new control kind, described as data, not a special case for this layer. Nothing switches on a layer id or a provider.
- Core stays pure: the newest time comes from `now`, which the ui passes from its clock, minus a latency the definition states.
- Times are UTC everywhere and the labels say so. Unit tests never depend on the machine's time zone.
- The layer is off until turned on and requests nothing until then. The Worker proxies nothing.
- Test first.

## Provider facts (probed 2026-11-11, UTC)

- Layer `IMERG_Precipitation_Rate_30min` on `gibs.earthdata.nasa.gov/wmts/epsg3857/best`, tile matrix set `GoogleMapsCompatible_Level6` (levels 0 to 6), 256 px PNG, `Access-Control-Allow-Origin: *`, no key.
- `TIME` is `YYYY-MM-DDTHH:MM:SSZ` on a 30-minute step; the colons may be percent-encoded, and seconds are required. A time between steps is served as the step before it.
- At 20:14 the newest slot that answered was 14:30 (15:00 was a 404), while the capabilities document said 13:30, so the capabilities lag and are not used.
- Tiles answer back to 2000-06-01. Recent slots come from the Early run (`v7_NRT`), older ones from the Final run (`v7_STD`).
- Tiles are about 1 to 10 KB each; a screen costs about 50 to 250 KB.
- Same GIBS colour map as the daily layer (`GPM_Precipitation_Rate`).

## Design

- `DateTimeControlDefinition` (`kind: "datetime"`): `stepMinutes` (divides a day), `min`, `max` and `default`, each a slot such as `2000-06-01t0000` or `{ minutesAgo: 360 }`, counted back from `now` and rounded down to the step.
- The value is the link-safe slot `YYYY-MM-DDtHHMM`, because the permalink only carries `[a-z0-9._-]`. `templateValues` turns it into the ISO instant (`2026-11-11T14:30:00Z`) for the URL template, so a template writes `{time}`.
- `resolveControlValues` reads a slot, rounds it down to the step and clamps it to the bounds; anything unreadable becomes the default. One control holds date and time, so the clamp sees both.
- Ui: a fieldset with the control's label as its legend, a native date input "Date (UTC)" bounded by the first and newest days, and a native select "Time (UTC)" that lists only the half hours that exist on that date. Under them: "Showing 14:30 to 15:00 UTC on 11 November 2026." and "Newest available: ...", tied to the inputs with `aria-describedby`.
- The definition's description states the latency in words. The newest slot is worked out when the layers mount and never refreshes on a timer.

## Tests

- Core: slot parsing, bounds, rounding and clamping, the template value, the list of slots for a day, the words; validation of good and bad definitions.
- Map: the control renders, offers only existing times, changes the value, is disabled when its condition is not met.
- Web: the loop test covers the new definition (schema, CSP, credits). E2e with GIBS mocked: nothing requested until on, the newest slot requested, a chosen slot requested and written to the link, a hand-edited link clamped. A11y scan with the control open.

## Order of work

1. Core types, slot helpers and validation, with tests.
2. Map control, with tests.
3. The definition, ATTRIBUTIONS.md, e2e and a11y.
4. DESIGN.md, ARCHITECTURE.md, the extending guide and ROADMAP.md; fold this plan away.
