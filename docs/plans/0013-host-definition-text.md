# 0013: Host-defined definition text

Status: in progress. Tracking issue: #368.

## Goal

A host can mark its own definition text (a layer or basemap name, description,
group, control label, empty-state text and the rest) as translatable, and its
message catalogue translates it, with the source text as the fallback. A plain
string stays exactly as written, and the shipped `MessageKey` values keep
working.

## Ground rules

- A plain string is never taken for a key: a host opts in explicitly, so an
  arbitrary string that looks like a key is shown as written.
- Keep legal text unchanged: `attribution` text, licence names and links stay
  plain.
- Do not branch on a layer, a provider or an id, add no dataset and no runtime
  dependency, and leave the typed `MessageKey` union to the SDK's own keys.
- Keep this separate from the keyed feature templates of #268
  (`LayerTemplate`), which carry placeholders; definition text has none.
- A definition is JSON-compatible, so the representation must survive a
  runtime catalogue's validation.

## Design

`DefinitionText` becomes `MessageKey | string | HostText`, where `HostText` is
`{ key: string; text: string }`: a host-defined catalogue key and the source
text, which is also the fallback. `MessageCatalogue.definitionTexts` is an
optional record of translations by key, and `createMessageCatalogue` takes it
in its fourth argument, as it does `layerTemplates`.

`resolveText(catalogue, text)` stays the one resolver. For a `HostText` it
returns the catalogue's own, non-blank entry for the key, or the source text
otherwise. A missing entry falls back without a warning, because a host may
translate in stages. A blank or non-string entry would hide the text, so it
falls back with one warning per key for each catalogue instance. An inherited
property is never read as a translation.

Announcements that name a layer pass `textOrMessage(name)`. A `HostText` goes
through as it is (`MessagePart` is `string | Message | HostText`), and
`formatMessage` resolves it with the active catalogue when it speaks the
sentence, so visible words, accessible names and announcements agree. The
announce helpers' name parameters take `MessagePart`.

`validateLayerDefinition` accepts a `HostText` wherever it accepts a
`DefinitionText` (`Problems.definitionText`) and requires a non-empty `key`
and `text`. Attribution text, the identify `records` path and a derived
layer's `sourceLayer` stay plain text.

The Layers section groups layers by the heading their `group` reads as in the
active language, so a key, a host text and plain text that read the same share
one heading. `TurnOffGroup` shows that heading, but finds its Undo by the layers the Undo would turn back on (`TurnedOff.ids`), not by words, and keys each group's element by its first layer's id, so a language change or a layer joining the group while the Undo is offered keeps both the Undo and the group's state. The SDK's own keyboard help
(`MAP_KEY_HELP`, `DRAW_KEY_HELP`) is typed as message keys only
(`ShippedKeyHelpEntry`), while a host's extra `keyHelp` lines may be any
`DefinitionText`.

Rejected: reusing `layerTemplates` for definition text (its entries are
checked for placeholders, which definition text does not have, and the two
tables would share keys); recognising a dotted string as a key by shape (it
mistakes plain text for a key, which the issue rules out); adding the host's
keys to `MessageKey` through declaration merging (it makes every host's keys
part of the SDK's contract and the Afrikaans completeness check); and a table
keyed by source text (identical words can need different translations, and a
copy edit would orphan the entry).

## Tests

Behavioural tests: `resolveText` for a host key with a
translation, a missing, a blank and an inherited key, and beside a shipped
key and a plain string; `formatMessage` for a host text in a placeholder and in
a list; `validateLayerDefinition` for accepted and rejected host texts and for
plain attribution; `createMessageCatalogue` carrying `definitionTexts`; and a
Layers section test in Afrikaans for the group, name, description, data cost,
disclaimer, control, option and class labels and the turn-on announcement,
plus a shared group heading.

## Order of work

1. The representation across the definition surfaces: `HostText`,
   `definitionTexts`, `resolveText`, `formatMessage`, validation, the Layers
   section's group headings, and the documents below. Files:
   `core/src/ports/messages.ts`, `core/src/messages`, `core/src/layers`, `core/src/announce`,
   `core/src/keyboard`, `core/src/fakes/FakeMessageCatalogue.ts`,
   `map/src/layers`, `web/src/app`.
2. A coverage check for a host: list the `HostText` keys a set of definitions
   uses and report those a catalogue's `definitionTexts` lacks, beside
   `checkMessageCatalogue`, so a host can find untranslated text before it
   ships. Files: `core/src/messages`, the translation guide.
3. Check the reference site in a second language with a `HostText` in a
   definition, including keyboard and screen-reader labels in the browser, if
   the site gains a host-keyed definition of its own. The reference site's
   own definitions keep using shipped keys until then.

## Documents to update

Step 1: `ARCHITECTURE.md` ("Definition text"),
`docs/guides/translate-the-sdk.md` (with a migration note),
`sites/docs/docs/guides/extending.md` and the core package README. `DESIGN.md` and the map
README do not change: the accessibility contract of the Layers section is the
same. `PRIVACY.md` needs no change: no request or data flow
is added. Step 2 adds its helper to the translation guide.

## Risks

A host that writes a `HostText` for an attribution would see it rejected by
validation, which is intended. A translation that is blank would hide a name,
so it falls back to the source with a warning. Grouping by resolved heading
means two different keys that translate to the same heading share one, which
is the reader's view of the list; the turn-off Undo finds its group by the
layers it would restore, so a language change or a new layer does not lose it. The widened `DefinitionText` type is a breaking change for SDK consumers, so the pull request is marked breaking and the translation guide carries a migration note. It breaks code that
treated it as a string, such as a test that passed a definition's name to a
string matcher; the shipped definitions are still strings and keys.

## Decided and open

Decided on 2026-11-19: use an explicit `{ key, text }` object rather than a
key-shaped string, store translations in a separate `definitionTexts` table
rather than in `layerTemplates`, fall back silently for a missing entry and
with one warning for a blank one, and group layers by their resolved heading.
Open: none.
