# Translate the SDK

How a host changes the words the interface shows, offers its visitors more than one language, or wires a message-format library of its own, without forking a component. The design is in [plan 0009](../plans/0009-i18n-message-catalogue.md) and the ports are described in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) ("The message catalogue" and "The language setting"). British English (`en-GB`) is the source language and the SDK's default.

## How the text is organised

- Most interface text is a key in the `MessageKey` union in `packages/core/src/ports/messages.ts`, such as `settings.theme.label`. The English text for every key is in `EN_GB_CATALOGUE` (`packages/core/src/messages/en-GB.ts`). Layer feature templates instead use a separate table of host-defined keys in `MessageCatalogue.layerTemplates`.
- A string is plain text with `{name}` placeholders. A plural can use `one form|other form`, with "one" first and every other category second, or category-keyed forms such as `one{{count} item} few{{count} items} other{{count} items}`. Supply every category returned by `new Intl.PluralRules(language).resolvedOptions().pluralCategories`; languages with categories beyond "one" and "other" need keyed forms. Category forms may contain `{name}` placeholders but not nested forms or literal braces. Counts use `Intl.PluralRules` for the selected value's language, which is the fallback language when the active catalogue lacks the key. Substituted numbers and days use `formatLocale(catalogue)` (the active language plus its numbering system), and lists use the active language.
- Call `plural` with `count` for count-bearing text, even when the English value is plain: the active value may have forms. A plain active value is substituted as with `t`. `formatMessage` calls `plural` when its parameters include a numeric `count`; `MessageParams` permits an optional count even for a key without an English count placeholder. A direct `t` call does not select a form.
- Numbers, dates and lists that go into a string are formatted by the catalogue for its own language, so a translation never has to format them. Numbers and days follow the language's own `Intl` defaults, so Persian writes native digits and a Persian or Thai day is in that language's calendar (Solar Hijri, Buddhist). Coordinates stay ASCII in every language when the app writes them, but `parseCoordinates` reads digits of any script, so a person can type in their own habit (the rules are in `docs/guides/using-the-reference-site.md`). A host that wants Latin digits next to its coordinates passes `numberingSystem: "latn"` in the fourth argument of `createMessageCatalogue`; the calendar is not changed. A malformed value (it must be 3 to 8 letters or digits) is ignored with one `console.warn`. A component or helper that formats a number or a day itself passes `formatLocale(catalogue)`, not `catalogue.language`, so the option reaches it; lists and plural selection use the plain language. The coordinate hemisphere letters are keys too (`format.hemisphereNorth` and so on), so a language can write N, S, O and W. The coordinate words the search box reads are keys as well: `format.wordNorth`, `format.wordSouth`, `format.wordEast`, `format.wordWest`, `format.wordDegree`, `format.wordMinute` and `format.wordSecond`. Each value is one word, or several separated by a space ("graad grade" for a singular and a plural), and `parseCoordinates` reads them as well as its English words, which always keep their meaning. The short unit symbols are keys too (`units.symbol.metre`, `units.symbol.kilometre`, `units.symbol.foot`, `units.symbol.mile`, `units.symbol.squareMetre`, `units.symbol.hectare`, `units.symbol.squareKilometre`, `units.symbol.squareFoot`, `units.symbol.acre`, `units.symbol.squareMile`), and `units.reading` (`{number} {symbol}`) sets the order and the spacing of a figure and its symbol, so a language can write "myl" for a mile or put the symbol first. These are the symbols on the scale bar, in the measure readout and in directions; the spoken forms are the `units.*` plural keys. A symbol is a short label that does not change with the figure, so keep it to a few characters: the scale bar widens its label to fit but its line keeps its fixed width.
- Feature lists sort text using the active catalogue's language, and re-sort when that language changes.
- "UTC" is part of fixed keys, so a time in UTC says so in every language.
- Text that comes from functions in core (announcements, descriptions of shapes and measures, error messages) is a key plus parameters, formatted where it is shown, so a translation can change the word order of a whole sentence.

## Use one language of your own

A host that speaks one language, other than English, gives `ServicesProvider` its own `messages`:

```ts
import { createMessageCatalogue, EN_GB_CATALOGUE } from "@mapcairn/core";

const messages = createMessageCatalogue("fr", FR_CATALOGUE, EN_GB_CATALOGUE);
```

`FR_CATALOGUE` is a `Partial<Record<MessageKey, string>>`. A key it leaves out falls back to the English value, with one `console.warn` for each missing key, so a half-finished translation still works. To change one word and keep the rest English, pass only that key: `{ "layers.title": "Data" }`. A fallback record in another language is supported with `fallbackLanguage` in the fourth argument, for example `{ fallbackLanguage: "af" }`. Plural selection uses that fallback language, while number and day formatting uses the active language with its numbering system.

## Offer more than one language

A host that offers a choice builds a `LanguageCatalogue` and passes it as `Services.languages`:

```ts
import { createLanguageCatalogue } from "@mapcairn/core";

const languages = createLanguageCatalogue(
  [
    { tag: "en-GB", label: "English" },
    { tag: "af", label: "Afrikaans" },
  ],
  "en-GB",
  (tag) => (tag === "af" ? loadAfrikaans() : english),
);
```

- `label` is the language's name in that language, so a visitor can find their own.
- `load` returns the messages directly or as a promise. Return the default language's messages directly, and put every other language in its own module that you import on demand (`import("./af")`), so a visitor who never asks for it does not download it. While a language loads, the previous one stays on screen. If a load fails (a chunk missing after a deploy, say), the previous language stays and `load` is called again the next time the setting or the browser's languages change, even to the same language. The Language control also says so, in the language still on screen ("Afrikaans could not be loaded.", naming the language by its own `label`), with a Try again button that loads it again, and it shows the language the interface is in as selected until a load succeeds. The failure is announced while the Language control is on screen, so one that happens while Settings is closed is announced when it opens. A component of your own reads the same state with `useLanguageLoad()` (`failed`, `retrying` and `retry`), which is `undefined` for a host with no `Services.languages`; the text is the keys `settings.language.loadFailed` and `settings.language.tryAgain`, so a catalogue you write needs them.
- The Settings panel shows a "Language" control (Automatic, then each language by its own name) only when more than one language is offered.
- The choice is `Settings.language`, kept on the device with the other settings and never in a shared link. `null` follows the browser: `resolveLanguage` takes the chosen tag if it is offered, else the first of the browser's languages that is offered (by exact tag, then by language subtag, so `af-ZA` gets `af`), else the default.
- Set `<html lang>` and `<html dir>` yourself on the server (the reference site renders its default language and direction) and keep them in step with the language in use on the client. The reference host does both in `packages/web/src/root.tsx` and the app layout `packages/web/src/routes/app.tsx`, and sets them before first paint from the stored tag with its inline theme script. Mark text in another language than the page's, such as a provider's own name, with `lang` on its element.
- An error boundary that replaces the route supplying the services cannot read `Settings.language` from them. The reference host's error page (`packages/web/src/app/useErrorPageMessages.ts`) reads the stored choice and the browser's languages itself, through the same settings and device-preference adapters (so blocked storage or a garbled value gives English), resolves them with `resolveLanguage`, loads the matching messages with the same loader, and sets `<html lang>` and `<html dir>` to the language it ends up in. It renders English first, because a server-rendered error cannot read the device's storage and the first client render must match it, and switches after it has started. If the language fails to load it stays in English. It imports no services provider and no map code, so nothing in it can fail with the route it replaces.

The reference site's language options are in `packages/web/src/i18n/offeredLanguageOptions.ts`, its loaders in `hostLanguages.ts`, and its Afrikaans `MessageKey` catalogue in `af.ts`, imported on demand. The Afrikaans wording of its keyed layer templates is in `afLayerTemplates.ts`, loaded together with `af.ts` and passed as `layerTemplates`. The generic `LayerTemplate` API below is for any host.

## Check a catalogue

`checkMessageCatalogue(language, catalogue, english, options)` from `@mapcairn/core` checks a catalogue against the English one and returns a list of problems, each a `key` and a `problem`; an empty list means it passes. Run it in your own tests:

```ts
import { checkMessageCatalogue, EN_GB_CATALOGUE } from "@mapcairn/core";

const SAME_AS_ENGLISH = { "basemap.bright.name": "A map style's name." };

expect(
  checkMessageCatalogue("fr", FR_CATALOGUE, EN_GB_CATALOGUE, {
    sameAsEnglish: SAME_AS_ENGLISH,
  }),
).toEqual([]);
```

A key is plural when its English value or the translation has forms, `one|other` or category-keyed, read as `createMessageCatalogue` reads them. Any other value is checked as text. `plural` reads a `|` as a separator between forms, while `t` shows it as written, so the check cannot tell from the text alone how a key with a `|` is read. List each key that is read only with `t` and has a `|`, or text that looks like keyed forms, in `notPlural`, and its values are checked as text. List in `pluralKeys` each key that is read with `plural` while its English value has a single form, such as `{count} file` for a language with no plural, so that the translation is checked as plural even when it has no forms either; without it, a translation such as `othre{{count} files}` passes as text. A key cannot be in both lists.

- `missing` and `unknown`: a key English has and the catalogue does not, or the other way round. A translation in progress can filter out `missing`.
- `emptyForm`: the value, or one of its plural forms, is blank.
- `placeholders`: the value, or any one of its plural forms, does not have exactly the `{name}` placeholders that the English value has across all its forms. A plural category does not cover the same numbers in every language (Russian "one" also covers 21, for example), so a form cannot drop `{count}` because the English form of the same category does. Write the number in every form; where a host knows that leaving it out is right, it can filter that key's `placeholders` problem in its own test.
- `pluralForms`: a plural key's forms are not exactly the categories `new Intl.PluralRules(language).resolvedOptions().pluralCategories` gives (a plain value counts as "other", and `one|other` as those two). A value that cannot be read is reported too: one that opens like keyed forms but does not parse, one with more than two `|` forms, and one with a brace that is not part of a `{name}` placeholder, such as `othre{{count} 件}`.
- `copiedEnglish`: a form is the same as the English form of its category, or English's "other" form when English has no form of that category, ignoring case and surrounding space, and the key has no entry of its own in `sameAsEnglish` with a reason that is not blank.
- `unusedAllowance`: an entry in `sameAsEnglish` whose reason is blank, whose value is missing or no longer matches English, or whose key English does not have; an entry in `pluralKeys` whose key English does not have, or whose English value already has forms; or an entry in `notPlural` whose key English does not have, or for which neither the English value nor the translation has forms.
- `conflictingOptions`: a key listed in both `pluralKeys` and `notPlural`. Neither list applies to it, so it is read as if it were in neither.

The problems come in English key order, then unknown keys, then unused `sameAsEnglish`, `pluralKeys` and `notPlural` entries in that order, then keys in both lists. Only the catalogues' own keys are read, so a key such as `constructor` is checked like any other and nothing is inherited from an object's prototype.

Both catalogues are plain objects, so one loaded from JSON works as well as a module. Pass as `english` the English your host shows: `EN_GB_CATALOGUE`, or your own English for the same keys if you replaced its wording. The keys are the SDK's `MessageKey` values. `resolveText` looks up only those, so a definition's text that is not one of them is shown as written, and a key of your own in a catalogue is never looked up for a definition.
To see what is left to translate, run `npm run catalogue:check -- <language> <file> [export] [--english <file>] [--english-export <export>] [--plural <key>]... [--not-plural <key>]...` in this repository. It prints how many keys the catalogue is missing and how many are the same as English, then lists each. The file is a JSON object of messages or a TypeScript or JavaScript module, read through tsx; `export` names the export that holds the messages and defaults to the module's only export, else its default export. The English is `EN_GB_CATALOGUE` unless `--english` names a file of your own English, read the same way, with `--english-export` naming its export. `--plural` and `--not-plural` pass a key to `pluralKeys` and `notPlural`, and each can be given more than once. A relative path is read from the folder npm was run in. An argument the command would otherwise ignore (an extra argument, an unknown option, an empty option value such as `--english=`, a second `--english` or `--english-export`, `--english-export` without `--english`, or an export name for a JSON file) is refused with exit code 2, and so is a `--plural` or `--not-plural` key that English does not have (a misspelt key, named in the message), that is not needed, or that is given to both. A file that is not a plain object whose values are all text, such as a list or a `Map`, is refused with exit code 1; an object with a `null` prototype is read. The command does not know a test's `sameAsEnglish` list, so it lists those keys too, and it exits 0 once the catalogues are read: the test is the gate. The script is `packages/web/scripts/catalogueCheck.mjs`, and it uses only `checkMessageCatalogue` and `EN_GB_CATALOGUE`, so a host can copy it.

## Translate definitions

A basemap or layer definition's reader-facing text (a name, a description, a control label, an empty-state text) is a `DefinitionText`: a shipped `MessageKey` or a plain string. Only shipped `MessageKey` values are looked up in the active catalogue, where the definition is shown. Any other string, including a name of your own or a string that looks like a key, is shown as written and is not a catalogue key, so existing definitions keep working. To translate such a field, use a shipped `MessageKey`, or supply the plain text for the language when you build the definition. Attribution, licence names and links are legal text and stay as they are.

## Translate layer templates

Card titles and lines, list secondary lines, feed polygon and line labels, and range and interval units can use a host-defined key without adding it to `MessageKey`. Use a `LayerTemplate` object with the key and its source text:

```ts
const cardTitle = {
  key: "events.magnitude",
  text: "Magnitude {magnitude|number} at {place}",
};
```

Pass the host's separate layer-template table when building the catalogue:

```ts
const messages = createMessageCatalogue(
  "fr",
  FR_MESSAGES,
  EN_GB_CATALOGUE,
  { layerTemplates: FR_LAYER_TEMPLATES },
);
```

The source `text` supplies the fallback when the key is missing or its translation does not preserve the source's field and formatter placeholders, including repeated placeholders. Missing entries, plain-string templates and valid source-language templates use the source without a warning. A supplied blank or mismatched translation warns once per key per catalogue instance, then falls back; valid translations may reorder placeholders. Plain strings remain literal and keep working as before; units include their own spacing, such as ` per km²`. A host with its own `MessageCatalogue` implementation can provide the same optional `layerTemplates` property. Vector-tile labels remain plain property names because the map engine reads them directly.

The `unit` fields on `ShapeIntervalColour` and `RangeControlDefinition` now accept `LayerTemplate`. TypeScript code that reads a unit from a definition must call `resolveLayerTemplate(unit, messages)` before rendering it, even when that definition uses a plain string.

## Use a message-format library of your own

`MessageCatalogue` is an interface with `language`, `t`, `plural` and `list`. The default, `createMessageCatalogue`, needs no library, but a host that already uses a message-format library can implement the same three methods on top of it and pass that as `Services.messages` (or return it from `load`). The library lives in the host. An SDK package never depends on one, and a library you adapt has to allow commercial use. Its `plural` must also handle a value with no plural forms, just as `t` does.

```ts
const messages: MessageCatalogue = {
  language: "fr",
  t: (key, params) => intl.formatMessage({ id: key }, params),
  plural: (key, params) => intl.formatMessage({ id: key }, params),
  list: (items, type) =>
    new Intl.ListFormat("fr", { type }).format(items),
};
```

A key that your library does not know is yours to handle: the SDK may call `t` or `plural` for a key in `MessageKey`.

## Add a language to the reference site

1. Add `packages/web/src/i18n/<tag>.ts` exporting a `Record<MessageKey, string>` (or a `Partial` for work in progress), and a loader for the tag in `hostLanguages.ts`. If the host also supplies layer-template translations, keep them in a separate module and load both modules on demand, leaving the `MessageKey` module with its single catalogue export.
2. Add the language to `OFFERED_LANGUAGE_OPTIONS` with its name in that language.
3. Keep every placeholder the English text has, spelled the same, in each form. Supply the categories your language needs, even when the English value has only one form. `packages/core/src/lint/messages.test.ts` checks English placeholders and categories against `MessageParams`; the Afrikaans test (`packages/web/src/i18n/af.test.ts`) runs `checkMessageCatalogue` (see "Check a catalogue" above) against English, with a short list of keys allowed to match English, each with a reason. Give a new language a test like it. A complete `Record<MessageKey, string>` also makes `npm run typecheck` fail when a key is added without its translation. `packages/core/src/lint/hardcodedCopy.test.ts` checks inline interface text in `.tsx` files under `packages/map/src` and `packages/web/src`; it does not check `.ts` string tables or props of SDK components, so look those up through the catalogue yourself. Its exceptions are in `scripts/copy-check/allowlist.mjs`.
4. Keep an accessible name containing its visible label, which a translation keeps by using the same key for both.
5. Run the layout and accessibility specs in the new language: add the language's catalogue to `e2e/support/language.ts` and a pair of projects like `af-chromium` and `af-mobile-chromium` in `playwright.config.ts`, which run the collision and accessibility specs with the `language` option set, and extend `e2e/i18n.spec.ts`. The page object finds the chrome by the names in the active catalogue. Translated text is often longer, so check that nothing collides or truncates.
6. A person who speaks the language fluently reviews the catalogue before it ships. A machine translation is a draft, and the pull request says who reviewed it. Credit the translators in [`ATTRIBUTIONS.md`](../../ATTRIBUTIONS.md).

## Right-to-left languages

No right-to-left language ships yet, but the interface is built to mirror: styles use logical properties (the harmony scanner fails a physical one), icons that point along the reading direction mirror, and the Playwright projects `rtl-chromium` and `rtl-mobile-chromium` run the basemap, keyboard, sheet and app-shell specs with `dir="rtl"`.

`languageDirection(tag, languages)` in core uses the tag's `Intl.Locale` text information, falling back to `ltr` when unavailable or invalid. A host may set `direction: "ltr"` or `"rtl"` on a `LanguageOption` to override it. The host sets `dir` alongside `lang` on `<html>`, including on its server-rendered default, and updates both when the active catalogue changes. The reference host resolves the offered directions in its Vite configuration and embeds them in the build. It passes those options to `buildThemeBootstrapScript`, so the pre-paint script does not need `Intl`. Recompute its CSP hash in both header files after changing the offered languages or the script.

## Type for non-Latin scripts and fonts

The type scale has negative tracking on the large, title and display steps and tight line heights (title 1.25, display 1.1), which suit Latin text. Letter spacing cuts the joins of Arabic script and the conjuncts of the Indic scripts, and the tall marks of Indic, Thai and Khmer text collide at tight line heights. So the theme sets the `type.nonLatin` tokens, tracking `0em` and a line height of 1.5 to 1.6 for every step, and a `:lang()` rule that applies them to the text of the languages listed in `tokenValues.nonLatinLanguages` (`@mapcairn/theme`): Arabic, Persian, Urdu, Pashto, Hebrew, the Indic languages, Thai, Lao, Khmer, Burmese, Amharic, Georgian, Armenian, Japanese, Korean and Chinese. The rule sets the variables on the element that carries the `lang`, so a `lang` attribute on `<html>` and one on a single place name in a Latin page both work, and a region or script subtag (`zh-Hans`) matches. Latin, Cyrillic and Greek text, and every language not in the list, keep the base scale, with one exception: custom properties inherit, so a `lang="en"` span inside a `lang="ar"` element keeps the Arabic values (zero tracking and a looser line height), which is harmless for Latin text. The list is not exhaustive (it also holds less common tags such as `sd`, `ug`, `ckb`, `yi`, `dv`, `ti`, `bo` and `jv`); a host adds a rule of its own for any other language, as below. A host that wants other values sets the `type.nonLatin` variables, for example with `globalStyle(":root", { vars: { [tokens.type.nonLatin.tracking]: "0.01em" } })`; a host that needs a script outside the list sets `type.<step>.tracking` and `type.<step>.lineHeight` under its own `:lang()` rule, after the theme's.

The SDK ships no non-Latin font, for licence and size reasons. The host supplies one by setting `type.family`, with the SDK's stack kept at the end so the metric-matched fallback and the system fonts still apply, by joining your face to `tokenValues.fontFamily` and setting the result under a `:lang()` rule, such as `globalStyle(":lang(ar)", { vars: { [tokens.type.family]: arabicStack } })`. The theme's `:lang()` rule never sets `type.family`, so the override is not clobbered. A test (`tokens.css.test.ts`) keeps that, and the Playwright spec `type-scripts.spec.ts` checks the computed tracking and line height for six languages.

## What a language does not change

- The search and routing providers receive the visitor's language only if their adapter sends it. The reference adapters do not, and one that starts to must update [`PRIVACY.md`](../../PRIVACY.md) and the provider note first.
- The copied coordinate value (`formatLatLng`) uses a dot and the letters N, S, E and W in every language, so it can be pasted elsewhere.
- The rule is that nothing in the repository is translated and only what shows in the host app is, with one decided exception: the product page at `/` is in British English only, because it is developer-facing and closer to documentation than to interface. Its text is in its own code (`packages/web/src/product/productContent.ts`), it is listed in the copy check's allowlist, and its route keeps `<html lang="en-GB">` whatever language the playground was set to (a `PageLanguageHandle` in `i18n/pageLanguage.ts`). The playground at `/map`, the privacy page and the error pages follow the language as before. Markdown files (`PRIVACY.md`, `README.md`, the guides) stay English only, with no translated copy beside them, and `PRIVACY.md` stays the English source of the privacy page. The privacy page shows in the app, so it is catalogue text: the `privacy.*` keys hold its headings and paragraphs, and a placeholder in a paragraph (`{link}`, `{themeKey}`) stands for a link or a `<code>` span that `PrivacyPage.tsx` supplies through `MessageParts` (`packages/web/src/i18n/MessageParts.tsx`), so a translator moves the markup with the sentence and no catalogue string holds markup. Keep every placeholder and the facts, names, numbers and addresses of the English text; a test (`PrivacyPage.language.test.tsx`) fails when the two languages differ in headings, paragraphs, links or code spans, and `PrivacyPage.markup.test.tsx` pins the English page, so changing its wording means changing that snapshot on purpose. The tab title follows the language too: a route exports a `handle` naming the catalogue key of the page's name (`PageTitleHandle` in `i18n/pageTitle.ts`), and `DocumentTitle` sets `document.title` from it once the app runs; a route with no handle gets back the title the document had when the app started, which is the server's English one. The server render, the meta description and the other tags that only crawlers and link previews read stay English. The developer design guide, which exists only in development and test builds, and the WebMCP tool text (it is for agents, not visitors) stay English. The default Settings privacy statement (`settings.privacy.default`, shown when a host passes no `privacyNote`) and the hidden keyboard instructions are catalogue text. Each instruction line is `host.map.keyInstruction` ("keys: description."), and the description is used exactly as written, so write it as a complete sentence with its own capital and no trailing full stop; no code changes the case of translated text. The short notes in Settings, Directions and the pin card that say what each service receives are catalogue keys, so a language translates them, and a test keeps the facts in them in step with the privacy page.

## Moving to symbol and word keys

A host that updates from a release without the `units.symbol.*`, `units.reading` and `format.word*` keys (18 in all) changes three things in its code:

- `formatDistance` and `formatArea` take the `MessageCatalogue` as their third argument, where they took `formatLocale(catalogue)` or a locale string.
- `ScaleBarInput.locale` is now `messages`, the catalogue.
- `DISTANCE_UNIT_SYMBOL` is gone: read a symbol with `catalogue.t("units.symbol.metre", {})` and its siblings, or format the reading with `formatDistance`.

There is no overload for the old arguments. A catalogue that lacks the new keys falls back to the English value, with one `console.warn` per missing key, and `checkMessageCatalogue` reports each one as `missing`, so add them to the translation.
