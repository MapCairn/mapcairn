---

title: Translate the SDK
sidebar_label: Translate the SDK
description: Add a language to the interface, wire your own messages, and handle direction, plurals and fonts.
---

# Translate the SDK

This page is for a developer who builds an interface with the SDK in a language other than British English, or in more than one. By the end you will know how the interface's text is organised, how to check a translation, and how to handle plurals, direction and fonts, without forking a component. For a first translation, start with [Translate the interface](../tasks/translate-the-interface.md), which changes the search box's words and offers two languages step by step. British English (`en-GB`) is the source language and the SDK's default. The ports are described in [ARCHITECTURE.md](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md) ("The message catalogue" and "The language setting"). To add a language to the reference site in this repository, follow [Add to the reference site](add-to-the-reference-site.md#add-a-language).

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

## What is supported

A host can build its interface with the SDK in the language or languages it chooses, written left to right or right to left. The SDK supplies the mechanism and the host supplies the words.

The SDK supplies:

- a message catalogue, with placeholders, plural categories from `Intl.PluralRules`, and lists, numbers and days formatted for the catalogue's language and numbering system;
- the reading direction from the language tag (or the host's override), a layout built from logical properties, and isolation of coordinates, numbers and names inside right-to-left text;
- unit symbols and coordinate words as catalogue keys, and `parseCoordinates` reading digits, minus signs and separators of other scripts;
- type tracking and line height that suit the scripts in `tokenValues.nonLatinLanguages`;
- translatable layer templates and host-keyed definition text (`HostText`), with `checkMessageCatalogue` and `checkDefinitionTexts` for a host's own tests.

The host supplies:

- its catalogue, and the `layerTemplates` and `definitionTexts` for its own layers and basemaps, in each language it offers;
- `<html lang>` and `<html dir>`, kept in step with the language in use;
- a font for any script that IBM Plex Sans does not cover.

The SDK ships British English. It has no machine translation and falls back to English for a missing key, it ships no non-Latin font, and a catalogue is a plain object, not a translator-friendly file format. It sends the visitor's language to a search or routing provider only if that provider's adapter does (see "What a language does not change").

## How the text is organised

Most interface text is a key in the `MessageKey` union, such as `settings.theme.label`. The English text for every key is in `EN_GB_CATALOGUE`. Layer feature templates instead use a separate table of host-defined keys in `MessageCatalogue.layerTemplates`.

| Topic                | How it works                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placeholders         | A string is plain text with `{name}` placeholders. A translation keeps every placeholder, spelled the same.                                                                                                                                                                                         |
| Plural forms         | `one form\|other form`, with "one" first and every other category second, or category-keyed forms such as `one{{count} item} few{{count} items} other{{count} items}`. A form may hold `{name}` placeholders but not nested forms or literal braces.                                                |
| Plural categories    | Supply every category that `new Intl.PluralRules(language).resolvedOptions().pluralCategories` returns. Languages with categories beyond "one" and "other" need keyed forms.                                                                                                                        |
| `plural` and `t`     | Call `plural` with `count` for count-bearing text, even when the English value is plain, because the active value may have forms. A plain value is substituted as with `t`. A direct `t` call does not select a form. `formatMessage` calls `plural` when its parameters include a numeric `count`. |
| Which language picks | Counts use `Intl.PluralRules` for the selected value's language, which is the fallback language when the active catalogue lacks the key.                                                                                                                                                            |
| Sorting              | Feature lists sort text using the active catalogue's language, and re-sort when that language changes.                                                                                                                                                                                              |
| UTC                  | "UTC" is part of fixed keys, so a time in UTC says so in every language.                                                                                                                                                                                                                            |
| Text from core       | Announcements, descriptions of shapes and measures and error messages are a key plus parameters, formatted where they are shown, so a translation can change the word order of a whole sentence.                                                                                                    |

### Numbers, days and lists

The catalogue formats the numbers, days and lists that go into a string, so a translation never has to.

- Numbers and days follow the language's own `Intl` defaults, so Persian writes native digits and a Persian or Thai day is in that language's calendar (Solar Hijri, Buddhist).
- Substituted numbers and days use `formatLocale(catalogue)` (the active language plus its numbering system), and lists use the active language. A component or helper that formats a number or a day itself passes `formatLocale(catalogue)`, not `catalogue.language`.
- Coordinates stay ASCII in every language when the app writes them, but `parseCoordinates` reads digits of any script, so a person can type in their own habit (the rules are in [Using the reference site](using-the-reference-site.md)).
- A host that wants Latin digits next to its coordinates passes `numberingSystem: "latn"` in the fourth argument of `createMessageCatalogue`; the calendar is not changed. A malformed value (it must be 3 to 8 letters or digits) is ignored with one `console.warn`.

### Right-to-left text

- In a right-to-left language the catalogue wraps each text value it puts into a string, and each item of a list, in invisible Unicode isolates (U+2068 and U+2069), so a place name or a coordinate keeps its own order inside the sentence. Write `{name}` placeholders as in English and add no markup or marks of your own.
- The catalogue takes the language's direction from the tag, or from the `direction` option of `createMessageCatalogue`: a host that sets `direction` on a `LanguageOption` passes the same value there. `isolateParameters: true` or `false` overrides the result either way.
- The marks sit in the text the catalogue returns, so strip U+2066 to U+2069 before an exact-text assertion in a host's tests.
- Components isolate their own names and figures with `Isolate`.

### Keys for units and coordinate words

| Keys                                                                                                                                                                                                                                                    | Used for                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format.hemisphereNorth` and its siblings                                                                                                                                                                                                               | The hemisphere letters, so a language can write N, S, O and W.                                                                                                                                                                                          |
| `format.wordNorth`, `format.wordSouth`, `format.wordEast`, `format.wordWest`, `format.wordDegree`, `format.wordMinute`, `format.wordSecond`                                                                                                             | The coordinate words the search box reads. Each value is one word, or several separated by a space ("graad grade" for a singular and a plural). `parseCoordinates` reads them as well as its English words, which always keep their meaning.            |
| `units.symbol.metre`, `units.symbol.kilometre`, `units.symbol.foot`, `units.symbol.mile`, `units.symbol.squareMetre`, `units.symbol.hectare`, `units.symbol.squareKilometre`, `units.symbol.squareFoot`, `units.symbol.acre`, `units.symbol.squareMile` | The short symbols on the scale bar, in the measure readout and in directions. A symbol is a short label that does not change with the figure, so keep it to a few characters: the scale bar widens its label to fit but its line keeps its fixed width. |
| `units.reading` (`{number} {symbol}`)                                                                                                                                                                                                                   | The order and the spacing of a figure and its symbol, so a language can write "myl" for a mile or put the symbol first.                                                                                                                                 |
| The `units.*` plural keys                                                                                                                                                                                                                               | The spoken forms.                                                                                                                                                                                                                                       |

## Use one language of your own

A host that speaks one language, other than English, gives `ServicesProvider` its own `messages`. [Translate the interface](../tasks/translate-the-interface.md) builds a whole app around this:

```ts check
import {
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  type MessageKey,
} from "@mapcairn/sdk";

const FR_CATALOGUE: Partial<Record<MessageKey, string>> = {
  "tools.search.places": "Rechercher un lieu",
};

export const messages = createMessageCatalogue(
  "fr",
  FR_CATALOGUE,
  EN_GB_CATALOGUE,
);
```

A key the catalogue leaves out falls back to the English value, with one `console.warn` for each missing key, so a half-finished translation still works. To change one word and keep the rest English, pass only that key: `{ "layers.title": "Data" }`. A fallback record in another language is supported with `fallbackLanguage` in the fourth argument, for example `{ fallbackLanguage: "af" }`. Plural selection uses that fallback language, while number and day formatting uses the active language with its numbering system.

## Offer more than one language

A host that offers a choice builds a `LanguageCatalogue` and passes it as `Services.languages`. [Translate the interface](../tasks/translate-the-interface.md) has a whole example with a switcher. The parts to know:

- `label` is the language's name in that language, so a visitor can find their own.
- `load` returns the messages directly or as a promise. Return the default language's messages directly, and put every other language in its own module that you import on demand (`import("./af")`), so a visitor who never asks for it does not download it. While a language loads, the previous one stays on screen.
- If a load fails (a chunk missing after a deploy, say), the previous language stays and `load` is called again the next time the setting or the browser's languages change, even to the same language. The Language control says so, in the language still on screen ("Afrikaans could not be loaded.", naming the language by its own `label`), with a Try again button, and it shows the language the interface is in as selected until a load succeeds. The failure is announced while the Language control is on screen, so one that happens while Settings is closed is announced when it opens.
- A component of your own reads the same state with `useLanguageLoad()` (`failed`, `retrying` and `retry`), which is `undefined` for a host with no `Services.languages`. The text is the keys `settings.language.loadFailed` and `settings.language.tryAgain`, so a catalogue you write needs them.
- The Settings panel shows a "Language" control (Automatic, then each language by its own name) only when more than one language is offered.
- The choice is `Settings.language`, kept on the device with the other settings and never in a shared link. `null` follows the browser: `resolveLanguage` takes the chosen tag if it is offered, else the first of the browser's languages that is offered (by exact tag, then by language subtag, so `af-ZA` gets `af`), else the default.
- Set `<html lang>` and `<html dir>` yourself on the server and keep them in step with the language in use on the client. Mark text in another language than the page's, such as a provider's own name, with `lang` on its element.
- An error boundary that replaces the route supplying the services cannot read `Settings.language` from them. Read the stored choice and the browser's languages yourself, resolve them with `resolveLanguage`, load the matching messages with the same loader, and render the default language first, so the first client render matches a server-rendered one.

## Check a catalogue

`checkMessageCatalogue(language, catalogue, english, options)` from `@mapcairn/sdk` checks a catalogue against the English one and returns a list of problems, each a `key` and a `problem`; an empty list means it passes. Run it in your own tests:

```ts no-check
import { checkMessageCatalogue, EN_GB_CATALOGUE } from "@mapcairn/sdk";

const SAME_AS_ENGLISH = { "basemap.bright.name": "A map style's name." };

expect(
  checkMessageCatalogue("fr", FR_CATALOGUE, EN_GB_CATALOGUE, {
    sameAsEnglish: SAME_AS_ENGLISH,
  }),
).toEqual([]);
```

Both catalogues are plain objects, so one loaded from JSON works as well as a module. Pass as `english` the English your host shows: `EN_GB_CATALOGUE`, or your own English for the same keys if you replaced its wording.

| Problem              | Meaning                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `missing`            | English has the key and the catalogue does not. A translation in progress can filter these out.                                                                                                                                                                                                                                |
| `unknown`            | The catalogue has a key English does not.                                                                                                                                                                                                                                                                                      |
| `emptyForm`          | The value, or one of its plural forms, is blank.                                                                                                                                                                                                                                                                               |
| `placeholders`       | The value, or any one of its plural forms, does not have exactly the `{name}` placeholders that the English value has across all its forms. A plural category does not cover the same numbers in every language (Russian "one" also covers 21), so write the number in every form.                                             |
| `pluralForms`        | A plural key's forms are not exactly the categories `Intl.PluralRules` gives for the language (a plain value counts as "other", and `one\|other` as those two). A value that cannot be read is reported too: one that opens like keyed forms but does not parse, one with more than two `\|` forms, or one with a stray brace. |
| `copiedEnglish`      | A form is the same as the English form of its category, ignoring case and surrounding space, and the key has no entry of its own in `sameAsEnglish` with a reason that is not blank.                                                                                                                                           |
| `unusedAllowance`    | An entry in `sameAsEnglish`, `pluralKeys` or `notPlural` that no longer applies: a blank reason, a value that no longer matches English, or a key English does not have.                                                                                                                                                       |
| `conflictingOptions` | A key listed in both `pluralKeys` and `notPlural`. Neither list applies to it.                                                                                                                                                                                                                                                 |

A key is plural when its English value or the translation has forms, read as `createMessageCatalogue` reads them; any other value is checked as text. Because `plural` reads a `|` as a separator and `t` shows it as written, two options tell the check how a key is read:

- `notPlural`: keys that are read only with `t` and have a `|`, or text that looks like keyed forms. Their values are checked as text.
- `pluralKeys`: keys that are read with `plural` while the English value has a single form, such as `{count} file` for a language with no plural, so the translation is checked as plural even when it has no forms either.

The problems come in English key order, then unknown keys, then unused entries and keys in both lists.

To see what is left to translate, a host can copy `packages/web/scripts/catalogueCheck.mjs`. It uses only `checkMessageCatalogue` and `EN_GB_CATALOGUE`, prints how many keys a catalogue is missing and how many are the same as English, then lists each. In this repository it runs as `npm run catalogue:check -- <language> <file>`.

## Translate definitions

A basemap or layer definition's reader-facing text (a name, a description, a control label, an empty-state text) is a `DefinitionText`: a shipped `MessageKey`, a `HostText` or a plain string. Only shipped `MessageKey` values are looked up in the typed catalogue. Any other string, including a name of your own or a string that looks like a key, is shown as written. To translate a field of your own, write a `HostText`: an object with your own `key` and the source `text`, which is also the fallback.

```ts no-check
const layer = {
  // ...
  name: { key: "host.rivers.name", text: "Rivers" },
  group: { key: "host.group.water", text: "Water" },
};

const afrikaans = createMessageCatalogue("af", AF_CATALOGUE, EN_GB_CATALOGUE, {
  definitionTexts: {
    "host.rivers.name": "Riviere",
    "host.group.water": "Water",
  },
});
```

`MessageCatalogue.definitionTexts` holds the translation by key; `createMessageCatalogue` accepts it in its fourth argument, and a catalogue of your own may provide the same optional property. A key with no own entry shows the source text without a warning, and a blank entry shows the source text with one warning. The same text is used for the visible words, the accessible names and the announcements that name the layer. Keys of `definitionTexts` and `layerTemplates` are separate, so a key can have a name and a template. Layers that write their `group` with the same words share one heading. Attribution, licence names and links are legal text and stay as they are.

Code of your own that reads a definition's `name`, `group`, `label` or similar must call `resolveText(catalogue, text)` (`useResolveText()` in a component), because the field may be a `HostText`. A name that reaches an announcement is passed on with `textOrMessage(name)`, and the `announce*` name parameters take a `MessagePart`: a string, a `Message` or a `HostText`.

A missing entry is silent, so check your own keys before you ship. `checkDefinitionTexts(definitions, definitionTexts)` lists the `HostText` keys in the definitions you pass (layers, basemaps, keyboard help lines, or any mix) and returns a problem for each key the language's `definitionTexts` lacks or holds blank. Each problem is a `key` and a `problem`, and an empty list means every key is translated. Run it in your own tests, once for each language you offer:

```ts no-check
import { checkDefinitionTexts } from "@mapcairn/sdk";

const problems = checkDefinitionTexts(
  [...MY_LAYERS, ...MY_BASEMAPS],
  MY_AFRIKAANS_DEFINITION_TEXTS,
);

expect(problems.filter(({ problem }) => problem !== "unused")).toEqual([]);
```

- `missing`: a definition uses the key and the record has no entry of its own for it, so the source text shows.
- `blank`: the entry is blank or not text, so the source text shows and `resolveText` warns.
- `unused`: the record has an entry that none of the definitions uses, such as one left over after a key was renamed. It is only meaningful when you pass every definition you ship, so a test that passes only some of them filters it out, as the example does.

The problems come in the order the definitions first use each key, then the unused entries in the record's order. A plain string and a shipped `MessageKey` are not reported, and neither is a layer template: a card's `title` and `lines`, a list's `secondary`, a control's or colour's `unit` and a label's `template` are skipped, because their keys belong to `layerTemplates`. The check only reports: it does not throw and does not change how `resolveText` falls back.

## Translate layer templates

Card titles and lines, list secondary lines, feed polygon and line labels, and range and interval units can use a host-defined key without adding it to `MessageKey`. Use a `LayerTemplate` object with the key and its source text:

```ts no-check
const cardTitle = {
  key: "events.magnitude",
  text: "Magnitude {magnitude|number} at {place}",
};
```

Pass the host's separate layer-template table when building the catalogue:

```ts no-check
const messages = createMessageCatalogue(
  "fr",
  FR_MESSAGES,
  EN_GB_CATALOGUE,
  { layerTemplates: FR_LAYER_TEMPLATES },
);
```

- The source `text` supplies the fallback when the key is missing or its translation does not preserve the source's field and formatter placeholders, including repeated placeholders.
- A translation may reorder placeholders.
- Missing entries, plain-string templates and valid source-language templates use the source without a warning. A supplied blank or mismatched translation warns once per key per catalogue instance, then falls back.
- Plain strings remain literal. Units include their own spacing, such as ` per km²`.
- A host with its own `MessageCatalogue` implementation can provide the same optional `layerTemplates` property.
- Vector-tile labels remain plain property names because the map engine reads them directly.
- The `unit` fields on `ShapeIntervalColour` and `RangeControlDefinition` accept a `LayerTemplate`, so code that reads a unit from a definition calls `resolveLayerTemplate(unit, messages)` before rendering it, even when that definition uses a plain string.

## Use a message-format library of your own

`MessageCatalogue` is an interface with `language`, `t`, `plural` and `list`. The default, `createMessageCatalogue`, needs no library, but a host that already uses a message-format library can implement the same methods on top of it and pass that as `Services.messages` (or return it from `load`). The library lives in the host. An SDK package never depends on one, and a library you adapt has to allow commercial use. Its `plural` must also handle a value with no plural forms, just as `t` does.

```ts no-check
const messages: MessageCatalogue = {
  language: "fr",
  t: (key, params) => intl.formatMessage({ id: key }, params),
  plural: (key, params) => intl.formatMessage({ id: key }, params),
  list: (items, type) =>
    new Intl.ListFormat("fr", { type }).format(items),
};
```

A key that your library does not know is yours to handle: the SDK may call `t` or `plural` for a key in `MessageKey`.

## Right-to-left languages

A host can offer a right-to-left language, and the interface mirrors: styles use logical properties, and icons that point along the reading direction mirror.

`languageDirection(tag, languages)` uses the tag's `Intl.Locale` text information, falling back to `ltr` when unavailable or invalid. A host may set `direction: "ltr"` or `"rtl"` on a `LanguageOption` to override it. The host sets `dir` alongside `lang` on `<html>`, including on its server-rendered default, and updates both when the active catalogue changes. To set them before first paint from the stored choice, `buildThemeBootstrapScript(offeredLanguages)` from `@mapcairn/sdk` builds an inline script that takes the offered `LanguageOption`s, so the script does not need `Intl`. A page with a Content Security Policy must allow the script by its hash.

## Type for non-Latin scripts and fonts

The type scale has negative tracking on the large, title and display steps and tight line heights (title 1.25, display 1.1), which suit Latin text. Letter spacing cuts the joins of Arabic script and the conjuncts of the Indic scripts, and the tall marks of Indic, Thai and Khmer text collide at tight line heights. So the theme sets the `type.nonLatin` tokens, tracking `0em` and a line height of 1.5 to 1.6 for every step, and a `:lang()` rule that applies them to the text of the languages listed in `tokenValues.nonLatinLanguages` (`@mapcairn/theme`): Arabic, Persian, Urdu, Pashto, Hebrew, the Indic languages, Thai, Lao, Khmer, Burmese, Amharic, Georgian, Armenian, Japanese, Korean and Chinese.

- The rule sets the variables on the element that carries the `lang`, so a `lang` attribute on `<html>` and one on a single place name in a Latin page both work, and a region or script subtag (`zh-Hans`) matches.
- Latin, Cyrillic and Greek text, and every language not in the list, keep the base scale. Custom properties inherit, so a `lang="en"` span inside a `lang="ar"` element keeps the Arabic values, which is harmless for Latin text.
- The list is not exhaustive. A host adds a rule of its own for any other language, setting `type.<step>.tracking` and `type.<step>.lineHeight` under its own `:lang()` rule, after the theme's.
- A host that wants other values sets the `type.nonLatin` variables, for example with `globalStyle(":root", { vars: { [tokens.type.nonLatin.tracking]: "0.01em" } })`.

The SDK ships no non-Latin font, for licence and size reasons. The host supplies one by setting `type.family`, with the SDK's stack kept at the end so the metric-matched fallback and the system fonts still apply, by joining your face to `tokenValues.fontFamily` and setting the result under a `:lang()` rule, such as `globalStyle(":lang(ar)", { vars: { [tokens.type.family]: arabicStack } })`. The theme's `:lang()` rule never sets `type.family`, so the override is not clobbered.

## What a language does not change

- The search and routing providers receive the visitor's language only if their adapter sends it. If yours starts to, say so in your privacy text first.
- The copied coordinate value (`formatLatLng`) uses a dot and the letters N, S, E and W in every language, so it can be pasted elsewhere.
