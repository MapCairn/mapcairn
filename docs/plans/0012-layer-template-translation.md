# 0012: Layer template translation

Status: done. Tracking issue: #268.

## Goal

A host can translate the words around layer feature values without changing
the feature fields or their formatters. Layer units can follow the same active
catalogue, while existing plain-string definitions keep their current meaning.

## Ground rules

- Keep feature fields and message parameters separate. A translation preserves
  the source template's exact field and formatter pairs, including duplicates,
  but may put them in another order.
- Keep plain strings working as written, do not branch on a layer or provider,
  add no runtime dependency or dataset, and leave credits as legal text.
- Translate feed polygon and line labels. Vector-tile labels name one property
  that the map engine reads directly, so they remain plain and untranslated.

## Design

`LayerTemplate` is either the existing string or `{ key, text }`, where `key`
is a host-defined catalogue key and `text` is the source and fallback template.
`MessageCatalogue.layerTemplates` is an optional record of translations. The
fourth, optional `createMessageCatalogue` argument carries that record for the
dependency-free catalogue; a host with its own catalogue implementation can
provide the same property. Core uses a translation only when the catalogue has
an own value for the key and its template contains the same field and formatter
pairs as the source. Otherwise it formats the source. Definition validation
checks the source fields and formatters, not translated text.

Card titles and lines, list secondary lines, feed-shape labels, range units and
interval units use `LayerTemplate`. The unit's text includes its own spacing.
The map already redraws feed-shape labels when the active catalogue changes;
cards, lists, units and legends read the active catalogue as they render.

This keeps host keys out of the SDK's `MessageKey` union and lets field names
remain host-defined. A table keyed by source text was rejected because
identical templates can need different translations and edits to source copy
would change the key. Vector-tile labels are not included because they have no
words around the property name and the engine reads the property itself.

## Tests

Start with failing behavior tests for reordered fields, fallback on missing or
mismatched translations, one warning per invalid supplied key per catalogue
instance, validation of source fields, interval and range units, card and list
text, and a feed polygon label. Retain the plain-string cases and verify that
vector-tile labels still require one property.

## Order of work

1. Add the keyed template value and catalogue table in core; validate sources,
   warn once per invalid supplied key per catalogue instance, and resolve
   translations for cards, lists, feed-shape labels and units.
   Wire the map components and drawing path to the active catalogue, with
   behavioral tests for each surface.

## Documents to update

Update `README.md`, `ARCHITECTURE.md`, `DESIGN.md`, the `extending` and
`translate-the-sdk` guides, and the core and map package READMEs with the API,
fallback rules and component contracts. This plan's implementation and status
are part of the same #268 pull request; remove it from the open-plans list in
that pull request so the merged list reflects the completed work. `PRIVACY.md`
does not need a change: no new request or data flow is introduced.

## Risks

A translation that drops a field, changes a formatter or duplicates a
placeholder could hide a value or alter its formatting. Comparing the complete
placeholder pairs as a multiset, warning once for an invalid supplied value,
and falling back to the source contains that risk. A host that omits an entry
still gets the original definition text without a warning.

## Decided and open

Decided on 2026-11-18: keep host-defined layer placeholders separate from typed
message parameters, and retain the source template as the fallback.

Open: none.
