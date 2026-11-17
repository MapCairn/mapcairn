// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapDefinition,
  type Bounds,
  defaultControlValues,
  feedUrl,
  identifyUrl,
  isIdentifiable,
  type LayerDefinition,
  loadsFeatures,
  tileUrl,
} from "@mapcairn/core";

/** The sources every policy starts a fetching directive with. */
const SELF = "'self'";

/** Any time and place will do: the origin of a URL does not depend on them. */
const SAMPLE_TIME = 0;
const SAMPLE_AREA: Bounds = { south: 0, west: 0, north: 1, east: 1 };
const SAMPLE_TAP = { latlng: { lat: 0, lng: 0 }, zoom: 0 };

/** What a host offers, and what it names itself, for {@link buildContentSecurityPolicy}. */
export interface PolicyInputs {
  /** The basemaps the host offers. */
  readonly basemaps: readonly BasemapDefinition[];
  /** The layers the host offers. */
  readonly layers: readonly LayerDefinition[];
  /**
   * Origins the definitions do not name, to allow in `connect-src`: the host's
   * own adapters (place search, routing) and the hosts a basemap's style
   * requests for its sprites, glyphs and tile sets.
   */
  readonly connectOrigins?: readonly string[];
  /** Sources for the host's inline scripts, such as a `'sha256-...'` hash or a nonce. */
  readonly scriptSources?: readonly string[];
}

/** The origins a set of definitions asks, by the directive that must allow them. */
interface Origins {
  readonly connect: readonly string[];
  readonly image: readonly string[];
}

function originOf(url: string): string {
  return new URL(url).origin;
}

function basemapOrigins({ source }: BasemapDefinition): Origins {
  switch (source.kind) {
    case "raster":
      return {
        connect: [originOf(source.tileUrl)],
        image: [originOf(source.tileUrl)],
      };
    case "vector":
      return { connect: [originOf(source.styleUrl)], image: [] };
    case "hybrid":
      return {
        connect: [originOf(source.tileUrl), originOf(source.labelStyleUrl)],
        image: [originOf(source.tileUrl)],
      };
  }
}

function layerOrigins(definition: LayerDefinition): Origins {
  const controls = defaultControlValues(definition, SAMPLE_TIME);
  if (loadsFeatures(definition)) {
    const detail = "detail" in definition ? definition.detail : undefined;
    return {
      connect: [
        originOf(feedUrl(definition, controls, SAMPLE_TIME, SAMPLE_AREA)),
        ...(detail?.origins ?? []),
      ],
      image: [],
    };
  }
  const tiles = originOf(tileUrl(definition, controls, SAMPLE_TIME));
  const identify = isIdentifiable(definition)
    ? [originOf(identifyUrl(definition, controls, SAMPLE_TIME, SAMPLE_TAP))]
    : [];
  return { connect: [tiles, ...identify], image: [tiles] };
}

function unique(sources: readonly string[]): string[] {
  return [...new Set(sources)];
}

/**
 * Builds a strict Content-Security-Policy header from what a host offers: the
 * origins of its basemaps and layers are read from their definitions, so
 * adding a definition adds its origins and a policy never lists one nothing
 * asks for. The fixed directives are the ones
 * `docs/guides/content-security-policy.md` names: nothing inline, the engine's
 * worker from the page's own origin or a blob, and every closing directive set
 * to `'none'` or `'self'`.
 *
 * @remarks A definition names only the first host it requests. A vector
 *   basemap's style brings sprites, glyphs and tile sets from hosts of its
 *   own, and a host's adapters name theirs in their own code, so pass those in
 *   `connectOrigins`. A tile origin goes in both `img-src` and `connect-src`:
 *   the engine fetches inside its worker as well as loading images.
 */
export function buildContentSecurityPolicy(inputs: PolicyInputs): string {
  const origins = [
    ...inputs.basemaps.map(basemapOrigins),
    ...inputs.layers.map(layerOrigins),
  ];
  const image = origins.flatMap((entry) => entry.image);
  const connect = [
    ...origins.flatMap((entry) => entry.connect),
    ...(inputs.connectOrigins ?? []),
  ];
  return [
    `default-src ${SELF}`,
    `script-src ${[SELF, ...(inputs.scriptSources ?? [])].join(" ")}`,
    `style-src ${SELF}`,
    `img-src ${[SELF, "data:", "blob:", ...unique(image)].join(" ")}`,
    `font-src ${SELF}`,
    `connect-src ${[SELF, ...unique(connect)].join(" ")}`,
    `worker-src ${SELF} blob:`,
    "frame-src 'none'",
    "object-src 'none'",
    `base-uri ${SELF}`,
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
