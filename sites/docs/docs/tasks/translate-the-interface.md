---

title: Translate the interface
sidebar_label: Translate the interface
description: Change the words the interface shows, or offer a choice of languages, without forking a component.
---

# Translate the interface

This page is for a developer whose map already shows, as in [Get started](../get-started.md), and who wants the interface in another language, or in more than one. By the end the search box and the other controls will use your words, and the app will offer two languages with a way to switch between them.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository. The code uses [`createMessageCatalogue`](../api/core/createMessageCatalogue.md), [`createLanguageCatalogue`](../api/core/createLanguageCatalogue.md), [`useLanguages`](../api/map/useLanguages.md), [`useSettings`](../api/map/useSettings-function.md) and [`SearchPill`](../api/map/SearchPill.md).

## How the words are held

Every piece of text the interface shows is a key in a message catalogue: `tools.search.places` is "Search places". British English is the source language and ships with the SDK as `EN_GB_CATALOGUE`. A translation is a plain object that holds some or all of the keys. A key it leaves out falls back to the English value, with one console warning for each, so a half-finished translation still works. The SDK supplies the mechanism and you supply the words; it ships no machine translation.

## Change the words

`createMessageCatalogue(language, catalogue, fallback)` builds the catalogue the services use. This one changes the search box's placeholder to French and leaves every other word English. Put it in `src/main.tsx` in place of the services from Get started:

```tsx check
/// <reference types="vite/client" />
import {
  createFakeServices,
  createMessageCatalogue,
  defaultBasemapFor,
  EN_GB_CATALOGUE,
  FocusRegistryProvider,
  MapChrome,
  MapView,
  SearchPill,
  useBasemaps,
  useMap,
  useTheme,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import type { ReactNode } from "react";

const FRENCH = { "tools.search.places": "Rechercher un lieu" };

export const services = createFakeServices({
  messages: createMessageCatalogue("fr", FRENCH, EN_GB_CATALOGUE),
  createMapAdapter: () =>
    createMapLibreMapAdapter({
      loadWorkerUrl: async () => {
        const worker = await import(
          "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
        );
        return worker.default;
      },
    }),
});

export function MapScreen() {
  const basemaps = useBasemaps();
  const { resolved } = useTheme();
  return (
    <MapView
      initialView={{ center: { lat: -33.92, lng: 18.42 }, zoom: 11, bearing: 0 }}
      basemap={defaultBasemapFor(basemaps, resolved)}
      chrome={(background) => <Chrome background={background} />}
    />
  );
}

function Chrome({ background }: { readonly background: ReactNode }) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        topStart={<SearchPill onSelect={() => undefined} />}
      />
    </FocusRegistryProvider>
  );
}
```

The first argument is the catalogue's language, a BCP 47 tag. It sets how numbers, lists and plurals are formatted, and the reading direction when it is a right-to-left language. A string may hold `{name}` placeholders, which a translation must keep, and plural forms such as `one{{count} item} other{{count} items}`. Text a host shows itself, such as a button of its own, looks up its words in the same catalogue with `useMessages()`, so one catalogue serves the whole page.

## Offer more than one language

A host that offers a choice builds a `LanguageCatalogue` and passes it as `Services.languages`. Its `load` function returns the messages for a tag, directly or as a promise, so every language except the default can be a separate file loaded on demand. This one offers English and French, and the component below it switches between them:

```tsx check
/// <reference types="vite/client" />
import {
  Button,
  createFakeServices,
  createLanguageCatalogue,
  createMessageCatalogue,
  EN_GB_CATALOGUE,
  FocusRegistryProvider,
  MapChrome,
  MapView,
  SearchPill,
  defaultBasemapFor,
  useBasemaps,
  useLanguages,
  useMap,
  useSettings,
  useTheme,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import type { ReactNode } from "react";

const english = createMessageCatalogue("en-GB", EN_GB_CATALOGUE, EN_GB_CATALOGUE);
const french = createMessageCatalogue(
  "fr",
  { "tools.search.places": "Rechercher un lieu" },
  EN_GB_CATALOGUE,
);

const languages = createLanguageCatalogue(
  [
    { tag: "en-GB", label: "English" },
    { tag: "fr", label: "Français" },
  ],
  "en-GB",
  (tag) => (tag === "fr" ? french : english),
);

export const services = createFakeServices({
  messages: english,
  languages,
  createMapAdapter: () =>
    createMapLibreMapAdapter({
      loadWorkerUrl: async () => {
        const worker = await import(
          "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
        );
        return worker.default;
      },
    }),
});

export function LanguageButtons() {
  const offered = useLanguages();
  const { settings, update } = useSettings();
  return (
    <>
      {offered?.languages.map(({ tag, label }) => (
        <Button
          key={tag}
          lang={tag}
          variant={settings.language === tag ? "primary" : "secondary"}
          onClick={() => update({ language: tag })}
        >
          {label}
        </Button>
      ))}
    </>
  );
}

export function MapScreen() {
  const basemaps = useBasemaps();
  const { resolved } = useTheme();
  return (
    <MapView
      initialView={{ center: { lat: -33.92, lng: 18.42 }, zoom: 11, bearing: 0 }}
      basemap={defaultBasemapFor(basemaps, resolved)}
      chrome={(background) => <Chrome background={background} />}
    />
  );
}

function Chrome({ background }: { readonly background: ReactNode }) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        topStart={<SearchPill onSelect={() => undefined} />}
        bottomStart={<LanguageButtons />}
      />
    </FocusRegistryProvider>
  );
}
```

The person's choice is `Settings.language`, a tag or `null` for "follow the browser". With `null`, `resolveLanguage` picks the first of the browser's languages that you offer, by exact tag and then by language subtag, so `fr-CA` gets `fr`, and otherwise the default. While a language loads, the previous one stays on screen. The SDK's Settings panel shows a language control, with each language under its own name, when more than one is offered.

## Direction, fonts and the page itself

- Set `<html lang>` and `<html dir>` yourself, and keep them in step with the language in use. The SDK's layout uses logical properties, so it mirrors in a right-to-left language, and `languageDirection` reads the direction from a tag.
- The SDK ships IBM Plex Sans only. A script it does not cover, such as Arabic or Thai, needs a font you load.
- Mark text in another language, such as a provider's own name, with `lang` on its element.

## Check your catalogue

`checkMessageCatalogue(language, catalogue, EN_GB_CATALOGUE, options)` compares a catalogue with the English one and returns each problem as a key and a kind, such as a key that is missing or unknown, a blank form, placeholders that differ from English, plural forms that differ, or a value copied from English. Run it in your own tests. [Translate the SDK](../guides/translate-the-sdk.md) has the full guide: the list of keys, plurals, the pseudo-locales, layer and basemap text, and right-to-left checks.
