---

title: Theme the interface
sidebar_label: Theme the interface
description: Give the interface your own colours, font and corners with a stylesheet that refuses colours too faint to read, and let people choose light, dark or system.
---

# Theme the interface

Give the interface from [Get started](../get-started.md) your brand with one generated stylesheet, then let people choose light, dark or system.

The code uses [`createThemeStylesheet`](../api/theme/createThemeStylesheet.md), [`ThemeSource`](../api/core/ThemeSource.md), [`useTheme`](../api/map/useTheme-function.md) and [`defaultBasemapFor`](../api/core/defaultBasemapFor.md).

## Brand the map

Run this in your build or a script and write the string it returns to a file your site serves:

```ts check
import { createThemeStylesheet } from "@mapcairn/sdk";

/** The brand stylesheet, or an error that says what was refused. */
export function brandStylesheet(): string {
  const result = createThemeStylesheet(
    {
      colour: {
        light: { accent: "#0b5c3a", accentTint: "#d9efe4" },
        dark: { accent: "#7fd9aa", accentTint: "#17382a" },
      },
    },
    { scope: ":root" },
  );
  if (!result.ok) {
    const failing = result.findings.filter((finding) => !finding.passes);
    throw new Error(
      `Theme refused: ${failing.length} colour pairs fail WCAG 2.2 AA, ${result.invalid.length} values cannot be used.`,
    );
  }
  return result.css;
}
```

Link the file after the SDK's own stylesheets, in the page's `<head>`:

```html no-check
<link rel="stylesheet" href="/brand.css" />
```

The interface now uses your accent in both themes, and colours you leave out keep the SDK's. `scope: ":root"` themes the whole page. A refused theme returns no CSS, so the SDK keeps its own colours, and the code above fails the build where you will see it: `result.findings` lists every pair checked (`passes: false` on those that fail) and `result.invalid` what could not be used. `invalid[].value` repeats what you passed in, so it is untrusted text: escape it before you print it into HTML. [Extending MapCairn](../guides/extending.md#theme-the-sdk-with-your-own-colours) lists the colour roles and the rules about scope.

## More you can change

Two more keys sit beside `colour`. `fontFamily` is a list of plain family names and generic families, and the SDK's own stack follows it: `fontFamily: '"Brand Sans", system-ui, sans-serif'`. `shape` is `"square"`, `"default"` or `"round"` and sets the corners of the pill, sheet, controls and inner shapes: `shape: "square"`. Any other value is refused and listed in `invalid`.

For two maps with different looks, make one stylesheet for each, with its own scope (`.brand-a`, `.brand-b` or `#id`), and put the class on an element around each map.

## What you can and cannot change

| What                                             | Can you?      | Why, or the way around                                                                                                                                    |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The accent and the other colour roles, per theme | Yes           | The 14 roles in [Extending MapCairn](../guides/extending.md#theme-the-sdk-with-your-own-colours), light and dark, each checked against WCAG 2.2 AA.       |
| The font family                                  | Yes           | `fontFamily`. You load the font file yourself (see the CSP note below).                                                                                   |
| The corners                                      | Yes           | `shape`. Circles stay circles and the search pill stays a pill.                                                                                           |
| Two maps with different looks                    | Yes, by scope | One stylesheet and one wrapper element for each.                                                                                                          |
| Light or dark for one map                        | No, per page  | The rules read `data-theme` on `<html>`, so every map on the page shares it.                                                                              |
| Spacing and density                              | No            | They stay the SDK's so the layout and the collision checks hold.                                                                                          |
| Slot positions and icons                         | No            | `MapChrome` owns the slots, and the icons are the SDK's own set ([DESIGN.md](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#layout-and-slots)). |
| The data palette and the map overlay colours     | No            | Layers and overlays have to read on any basemap, so they are not overridable. The page background is yours to set.                                        |
| Arbitrary CSS                                    | No            | The custom property names are generated and private, so a stylesheet of your own cannot name them.                                                        |

A tooltip renders outside your scope, so in a `#id` or `.class` scope it keeps the SDK's colours. In high-contrast and forced-colours modes the SDK keeps its own values and skips your theme.

## With a strict policy or your own reset

Under a strict Content Security Policy, link the stylesheet, because an inline `<style>` is blocked; a plain file passes `style-src 'self'`. A font file must be on your own origin or on one your `font-src` allows, and a font from another origin is blocked ([Content Security Policy](../guides/content-security-policy.md)).

The SDK's primitives sit in a cascade layer, so an unlayered reset of yours beats them. Declare your reset layer first, for example `@layer reset, base;`, and import the SDK's stylesheet after it ([Extending MapCairn](../guides/extending.md) says why).

## Light, dark or system

The SDK's stylesheet reads `data-theme` on `<html>` (`light` or `dark`) and follows the system's colour scheme without it. A `ThemeSource` writes the attribute when the person's choice or the system changes. The SDK's fake only records what it is asked to apply, so a host supplies its own. Create `src/theme.tsx` with one that uses `matchMedia`, and a `MapScreen` with three buttons in the `topStart` slot where Get started has the search box:

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

In `src/main.tsx`, delete `services`, `MapScreen` and `Chrome` and the imports only they used, then add this import. The providers in `App` and the mount stay as they are in Get started:

```ts no-check
import { MapScreen, services } from "./theme";
```

`useTheme()` returns the person's `choice` and the `resolved` theme. `defaultBasemapFor(basemaps, resolved)` gives Bright in light and Fiord in dark, so the map and the interface change together. The in-memory fake does not keep the choice between visits; a persistent settings store does.

`PageThemeSource` reads `window`, so build it only in the browser. A host that renders on the server gives the services a source that reports `light` and applies nothing, and sets `data-theme` from a small script in the head before the first paint to avoid a flash ([Content Security Policy](../guides/content-security-policy.md) says how to allow it).

## Related

- [Extending MapCairn](../guides/extending.md#theme-the-sdk-with-your-own-colours) lists the colour roles and the rules about scope.
- [Troubleshooting](../troubleshooting.md) covers a blank or unstyled map.
- [Translate the interface](translate-the-interface.md) is the other setting people choose.
