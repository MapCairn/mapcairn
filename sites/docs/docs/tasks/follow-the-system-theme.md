---

title: Switch between light and dark
sidebar_label: Switch between light and dark
description: Follow the system's light or dark setting and let people choose between light, dark and system, with the basemap changing alongside.
---

# Switch between light and dark

Make the interface from [Get started](../get-started.md) follow the system's light or dark setting, and let people choose between light, dark and system.

The code uses [`ThemeSource`](../api/core/ThemeSource.md), [`useTheme`](../api/map/useTheme-function.md) and [`defaultBasemapFor`](../api/core/defaultBasemapFor.md). The theme is per page: to change the colours, see [Theme the interface](theme-the-interface.md).

## Follow the system and let people choose

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

- [Theme the interface](theme-the-interface.md) gives the interface your own colours, font and corners.
- [Translate the interface](translate-the-interface.md) is the other setting people choose.
