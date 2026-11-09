# Supplying a domain configuration

Karta separates layer configuration from map rendering. `DomainConfig` contains `layers` and `layerGroups`; it does not prescribe a geography or dataset. The reference web host supplies empty arrays and publishes no overlays.

## Start empty

```tsx
import type { DomainConfig } from "@karta/core";
import { DomainProvider } from "@karta/map";

const domain: DomainConfig = { layers: [], layerGroups: [] };

<DomainProvider domain={domain}>
  <YourMap />
</DomainProvider>;
```

`DomainProvider` wraps the core registry and makes it available through `useDomain()`. Keep it above map and legend components. `useDomain()` throws outside the provider.

## Add consumer-owned layers

To build a separate application with overlays:

1. Define `Layer` entries using `packages/core/src/types/layer.ts`. Supply stable ids, display labels, geometry styles and data sources.
2. Define `LayerGroup` entries where the UI needs grouping or selection rules.
3. Pass the configuration to `DomainProvider`.
4. Pass visible layer ids, bounds, an accessible map name and any feature popup renderer to `MapView`.

Use `createRegistry` when you need the same catalogue without React. Use `createLayerConfig` for its Leaflet styles. Classification supports property-based styling; new layer ids must not require id-specific branches inside SDK code.

## Host responsibilities

The host owns data provenance, publication rights, fetch policy and any property-specific popup content. It must define the theme CSS variables and register the vanilla-extract Vite plugin. See [`packages/map/README.md`](../packages/map/README.md).

Allowlist any additional basemap, geocoder or data origin in the host's Content Security Policy. Development without production headers does not prove that a new origin will work after deployment.

Keep application data out of SDK packages. Adding a dataset to this repository's empty-map host requires a separate scoped decision; the SDK itself does not require one.
