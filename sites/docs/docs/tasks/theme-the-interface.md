---

title: Theme the interface
sidebar_label: Theme the interface
description: Switch between light and dark, follow the system setting, and give the interface your own colours.
---

# Theme the interface

This page is for a developer whose map already shows, as in [Get started](../get-started.md), and who wants the interface to follow the system's light or dark setting, let people choose, and use the brand's own colours. By the end the map will have a light, dark and system choice that changes the interface and the basemap together, and you will have a stylesheet that recolours the interface and refuses colours that are too faint to read.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository. The code uses [`ThemeSource`](../api/core/ThemeSource.md), [`useTheme`](../api/map/useTheme-function.md), [`defaultBasemapFor`](../api/core/defaultBasemapFor.md) and [`createThemeStylesheet`](../api/theme/createThemeStylesheet.md).

## How the theme works

The SDK's stylesheet reads `data-theme` on `<html>` (`light` or `dark`), and uses the system's colour scheme when the attribute is not set. Which theme applies is a setting, `system`, `light` or `dark`, held by the settings service. Something has to write the attribute when the setting or the system changes, and that is a `ThemeSource`: a small adapter with three methods, `getSystemTheme`, `subscribe` and `apply`. The SDK's fake only records what it is asked to apply and always reports a light system theme, so a host that wants the theme to take effect supplies its own.

## Follow the system and let people choose

This `ThemeSource` reads the system setting with `matchMedia` and writes the attribute. The component below shows three buttons. Create `src/theme.tsx` with this. It has its own `services`, with the source added, and its own `MapScreen`, which puts the buttons in the `topStart` slot where Get started has the search box:

```tsx check
/// <reference types="vite/client" />
import {
  Button,
  createFakeServices,
  defaultBasemapFor,
  FocusRegistryProvider,
  MapChrome,
  MapView,
  type ResolvedTheme,
  THEME_ATTRIBUTE,
  type ThemeChoice,
  type ThemeSource,
  useBasemaps,
  useMap,
  useTheme,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import type { ReactNode } from "react";

const DARK = "(prefers-color-scheme: dark)";

class PageThemeSource implements ThemeSource {
  getSystemTheme(): ResolvedTheme {
    return window.matchMedia(DARK).matches ? "dark" : "light";
  }

  subscribe(listener: (theme: ResolvedTheme) => void): () => void {
    const query = window.matchMedia(DARK);
    const onChange = () => listener(this.getSystemTheme());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }

  apply(theme: ResolvedTheme): void {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  }
}

export const services = createFakeServices({
  theme: new PageThemeSource(),
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

const CHOICES: readonly { readonly choice: ThemeChoice; readonly label: string }[] = [
  { choice: "system", label: "System" },
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
];

export function MapScreen() {
  const basemaps = useBasemaps();
  const { choice, resolved, setChoice } = useTheme();
  return (
    <MapView
      initialView={{ center: { lat: -33.92, lng: 18.42 }, zoom: 11, bearing: 0 }}
      basemap={defaultBasemapFor(basemaps, resolved)}
      chrome={(background) => (
        <Chrome background={background}>
          {CHOICES.map((option) => (
            <Button
              key={option.choice}
              variant={option.choice === choice ? "primary" : "secondary"}
              aria-pressed={option.choice === choice}
              onClick={() => setChoice(option.choice)}
            >
              {option.label}
            </Button>
          ))}
        </Chrome>
      )}
    />
  );
}

function Chrome({
  background,
  children,
}: {
  readonly background: ReactNode;
  readonly children: ReactNode;
}) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome background={background} modal={false} topStart={children} />
    </FocusRegistryProvider>
  );
}
```

Now change `src/main.tsx`. Delete `services`, `MapScreen` and `Chrome`, and the imports only they used. Add this import. The providers in `App` and the mount stay as they are in Get started:

```ts no-check
import { MapScreen, services } from "./theme";
```

`useTheme()` returns the person's `choice` and the `resolved` theme that applies, which is the choice, or the system's theme when the choice is `system`. `defaultBasemapFor(basemaps, resolved)` gives Bright in the light theme and Fiord in the dark theme, so the map and the interface change together.

The choice is a setting, so the settings service keeps it between visits when it has a store that persists; the in-memory fake does not. Applying the theme after the page has loaded can flash the wrong theme for a moment. A host that renders on the server avoids it by setting `data-theme` from a small script in the page head before it paints, with the same logic as `apply`; [Content Security Policy](../guides/content-security-policy.md) says how a strict policy allows that script.

## Use your own colours

`createThemeStylesheet` makes a stylesheet that gives the interface your colours, and refuses a theme that falls below WCAG 2.2 AA. It covers the interface's colour roles in light and dark and, optionally, the font family. It does not change the page background, the colours drawn on the map or the data palette. Run it in your build or a script, and serve the file it returns:

```ts check
import { createThemeStylesheet } from "@mapcairn/sdk";

/** The brand stylesheet, or an error that says the colours are not usable. */
export function brandStylesheet(): string {
  const result = createThemeStylesheet(
    {
      colour: {
        light: { accent: "#0b5c3a", accentTint: "#d9efe4" },
        dark: { accent: "#7fd9aa", accentTint: "#17382a" },
      },
      fontFamily: '"Brand Sans", system-ui, sans-serif',
    },
    { scope: ".brand" },
  );
  if (!result.ok) {
    throw new Error("The theme is below WCAG 2.2 AA or cannot be used.");
  }
  return result.css;
}
```

Link the file after the SDK's own stylesheets, and put the class from `scope` on an element around the map. It is a plain stylesheet, so a policy with `style-src 'self'` allows it. The result of a refused theme lists every pair of colours it checked and says which failed.

`fontFamily` is a list of plain family names and generic families. The generator refuses braces, semicolons, `url()`, `var()`, comments, newlines and anything else outside that, and names the reason in `invalidFields`. The SDK's own font stack follows your list as the fallback. You load the font yourself: the file must be on your own origin or allowed by your `font-src`, and the stylesheet must be linked, because a strict policy blocks an inline `<style>`. The result cannot know how wide a font is, so the layout makes the promise instead: controls keep their 44 px minimum and text wraps or is cut short inside them, whatever the font. [Extending MapCairn](../guides/extending.md#theme-the-sdk-with-your-own-colours) has the full list of colour roles and the rules about scope, high-contrast modes and tooltips.

## When it goes wrong

- **A theme below WCAG 2.2 AA.** `createThemeStylesheet` does not throw. It returns `ok: false` with every pair of colours it checked, the ones that fail marked `passes: false`, and what it could not use. There is no stylesheet to serve, so the interface keeps the SDK's own colours. The code above turns that into an error at build time, which is the right moment to find it.
- **A scope that is not allowed.** The scope must be `:root`, `#id` or `.class` with an ASCII name. Anything else is refused and reported in the result.
- **No `matchMedia`.** The `PageThemeSource` above reads `window`, so build it only in the browser. On a server, give the services a source that reports `light` and applies nothing, and set `data-theme` from a script before the first paint.
- **Contrast modes.** In high-contrast and forced-colours modes the SDK keeps its own values and skips your theme.

## Next steps

- [Extending MapCairn](../guides/extending.md#theme-the-sdk-with-your-own-colours) lists the colour roles and the rules about scope.
- [Troubleshooting](../troubleshooting.md) covers a blank or unstyled map.
- [Translate the interface](translate-the-interface.md) is the other setting people choose.
