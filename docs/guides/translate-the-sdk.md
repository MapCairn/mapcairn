# Translate the SDK

How a host changes the words the interface shows, offers its visitors more than one language, or wires a message-format library of its own, without forking a component. The design is in [plan 0009](../plans/0009-i18n-message-catalogue.md) and the ports are described in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) ("The message catalogue" and "The language setting"). British English (`en-GB`) is the source language and the SDK's default.

## How the text is organised

- Every word the interface shows is a key in the `MessageKey` union in `packages/core/src/ports/messages.ts`, such as `settings.theme.label`. The English text for every key is in `EN_GB_CATALOGUE` (`packages/core/src/messages/en-GB.ts`).
- A string is plain text with `{name}` placeholders. A key used with `plural` carries two forms separated by `|`: the form for the plural category "one" first, the form for every other category second. Counts use `Intl.PluralRules` for the catalogue's language, and lists use `Intl.ListFormat`.
- Numbers, dates and lists that go into a string are formatted by the catalogue for its own language, so a translation never has to format them. The coordinate hemisphere letters are keys too (`format.hemisphereNorth` and so on), so a language can write N, S, O and W.
- "UTC" is part of fixed keys, so a time in UTC says so in every language.
- Text that comes from functions in core (announcements, descriptions of shapes and measures, error messages) is a key plus parameters, formatted where it is shown, so a translation can change the word order of a whole sentence.

## Use one language of your own

A host that speaks one language, other than English, gives `ServicesProvider` its own `messages`:

```ts
import { createMessageCatalogue, EN_GB_CATALOGUE } from "@mapcairn/core";

const messages = createMessageCatalogue("fr", FR_CATALOGUE, EN_GB_CATALOGUE);
```

`FR_CATALOGUE` is a `Partial<Record<MessageKey, string>>`. A key it leaves out falls back to the English value, with one `console.warn` for each missing key, so a half-finished translation still works. To change one word and keep the rest English, pass only that key: `{ "layers.title": "Data" }`.

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
- Set `<html lang>` yourself on the server (the reference site renders its default language) and keep it in step with the language in use on the client. The reference host does both in `packages/web/src/root.tsx`, and sets it before first paint from the stored tag with its inline theme script. Mark text in another language than the page's, such as a provider's own name, with `lang` on its element.

The reference site's own setup is `packages/web/src/i18n/hostLanguages.ts`, with the Afrikaans catalogue in `packages/web/src/i18n/af.ts`.

## Translate definitions

A basemap or layer definition's reader-facing text (a name, a description, a control label, an empty-state text) is either a plain string or a `MessageKey`. A plain string is shown as it is, so existing definitions keep working. A key is looked up in the active catalogue where the definition is shown. To translate your own definitions, give them keys of your own and supply those keys in your catalogues, or write a plain string and accept that it does not change with the language. Attribution, licence names and links are legal text and stay as they are.

## Use a message-format library of your own

`MessageCatalogue` is an interface with `language`, `t`, `plural` and `list`. The default, `createMessageCatalogue`, needs no library, but a host that already uses ICU MessageFormat, FormatJS or another library can implement the same three methods on top of it and pass that as `Services.messages` (or return it from `load`). The library lives in the host. An SDK package never depends on one, and a library you adapt has to allow commercial use.

```ts
const messages: MessageCatalogue = {
  language: "fr",
  t: (key, params) => intl.formatMessage({ id: key }, params),
  plural: (key, params) => intl.formatMessage({ id: key }, params),
  list: (items, type) =>
    new Intl.ListFormat("fr", { type }).format(items),
};
```

A key that your library does not know is yours to handle: the SDK calls `t` for every key in `MessageKey`.

## Add a language to the reference site

1. Add `packages/web/src/i18n/<tag>.ts` exporting a `Record<MessageKey, string>` (or a `Partial` for work in progress), and a loader for the tag in `hostLanguages.ts`.
2. Add the language to `OFFERED_LANGUAGES` with its name in that language.
3. Keep every placeholder the English text has, spelled the same, and a key's plural forms in the same order as English (the "one" form, then the others). `packages/core/src/lint/messages.test.ts` checks the English catalogue against `MessageParams`, and a test beside each of the site's catalogues (`packages/web/src/i18n/af.test.ts`) checks that it has every key, the English placeholders in each form and the same number of forms; a complete `Record<MessageKey, string>` also makes `npm run typecheck` fail when a key is added without its translation. The same test fails when an Afrikaans value, or any one plural form of it, is a copy of the English one (compared without case or surrounding space), unless its key is on a short list in that file with a reason beside it (a unit symbol, a key label, a map style's name, a word both languages share). A second test, `packages/core/src/lint/hardcodedCopy.test.ts`, fails when a component in `packages/map` or `packages/web` writes interface text inline (JSX text, or `aria-label`, `aria-description`, `aria-roledescription`, `aria-valuetext`, `aria-placeholder`, `title`, `placeholder` or `alt`) instead of looking it up. It reads only `.tsx` files under the `src` folders of those two packages, so copy in a `.ts` string table is not scanned, and it does not read props of SDK components that carry copy (such as `label` or `tooltip`), so look those up through the catalogue yourself; the English-only text it allows (the privacy page and the developer design guide, see #271) is in `scripts/copy-check/allowlist.mjs`, each entry with its reason.
4. Keep an accessible name containing its visible label, which a translation keeps by using the same key for both.
5. Run the layout and accessibility specs in the new language: add the language's catalogue to `e2e/support/language.ts` and a pair of projects like `af-chromium` and `af-mobile-chromium` in `playwright.config.ts`, which run the collision and accessibility specs with the `language` option set, and extend `e2e/i18n.spec.ts`. The page object finds the chrome by the names in the active catalogue. Translated text is often longer, so check that nothing collides or truncates.
6. A person who speaks the language fluently reviews the catalogue before it ships. A machine translation is a draft, and the pull request says who reviewed it. Credit the translators in [`ATTRIBUTIONS.md`](../../ATTRIBUTIONS.md).

## Right-to-left languages

No right-to-left language ships yet, but the interface is built to mirror: styles use logical properties (the harmony scanner fails a physical one), icons that point along the reading direction mirror, and the Playwright projects `rtl-chromium` and `rtl-mobile-chromium` run the basemap, keyboard, sheet and app-shell specs with `dir="rtl"`. A host that adds one sets `dir` on `<html>` with `lang`.

## What a language does not change

- The search and routing providers receive the visitor's language only if their adapter sends it. The reference adapters do not, and one that starts to must update [`PRIVACY.md`](../../PRIVACY.md) and the provider note first.
- The copied coordinate value (`formatLatLng`) uses a dot and the letters N, S, E and W in every language, so it can be pasted elsewhere.
- The privacy page and the developer design guide stay in English. The short notes in Settings, Directions and the pin card that say what each service receives are catalogue keys, so a language translates them, and a test keeps the facts in them in step with the privacy page.
