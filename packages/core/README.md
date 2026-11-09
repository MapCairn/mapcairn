# `@karta/core`

Domain-agnostic layer contracts, classification, a registry and GeoJSON utilities. This package has no dependency on the web host, map components, React hooks or theme contract.

## Exports

| API | Purpose |
|---|---|
| `Layer`, `LayerGroup`, `DomainConfig` | Describe layers, their styles, interactions and grouping without selecting a dataset. |
| `resolveClassification` | Resolve feature properties to style values. |
| `createLayerConfig`, `resolveThemedColor` | Produce Leaflet style configuration and theme-aware colours. |
| `createRegistry` | Expose read-only layer and group accessors over a supplied configuration. |
| `fetchFeatureCollection`, `mergeFeatureCollections` | Fetch, validate, cache and merge GeoJSON collections. |
| GeoJSON schemas | Validate geometry and collection structure. |
| `partitionSettled` | Split settled promises into successful values and errors. |
| Measurement helpers in `spatial/measurement.ts` | Measure line length and polygon area, format results and create measurement geometry. |

The `spatial` directory name describes generic geographic measurement. These helpers remain because the map's distance and area tool uses them; they carry no dataset assumptions.

Line and point styles support optional property-based classifications, with flat style values as fallbacks. Line styles also support dash patterns and casing.

## Usage

The current host uses an empty configuration. Consumers can supply their own layers through the same contract.

```ts
import { createRegistry, type DomainConfig } from "@karta/core";

const domain: DomainConfig = { layers: [], layerGroups: [] };
const registry = createRegistry(domain);
const layers = registry.getLayers();
```

Rendering belongs in `@karta/map`; browser hooks belong in `@karta/react`. Consumer-specific data and presentation do not belong in this package.
