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

/** The one scheme a policy source may have: a basemap, layer or adapter on plain `http` is refused. */
const SECURE_SCHEME = "https:";

/** A template placeholder or a wildcard in a host: the origin it stands for is not one origin. */
const PLACEHOLDER_IN_HOST = /[{}*]/;

/** A scheme and a host: no path, query, user, wildcard or trailing slash. */
const BARE_ORIGIN = /^https:\/\/[^\s/?#@*{}]+$/;

/** What cannot sit inside one source of a directive: it would end the directive or the policy, or split the source. */
const SOURCE_BREAKS = /[;,\s]/;

/**
 * The origin of a URL a definition names.
 * @throws When the URL cannot be read as one, such as a template with a
 *   placeholder in its host (`https://{s}.tiles.example/...`), or is not `https`.
 *   The message names the owner, so the definition to fix is clear.
 */
function originOf(url: string, owner: string): string {
  const parsed = URL.canParse(url) ? new URL(url) : undefined;
  if (parsed === undefined || PLACEHOLDER_IN_HOST.test(parsed.host)) {
    throw new Error(
      `${owner}: cannot read an origin from "${url}"; its host must be fixed, with no placeholder.`,
    );
  }
  if (parsed.protocol !== SECURE_SCHEME) {
    throw new Error(`${owner}: "${url}" is not an https URL.`);
  }
  return parsed.origin;
}

/**
 * A bare `https` origin a host names itself: a scheme and a host, with no
 * path, wildcard or trailing slash.
 * @throws When the value is anything else, because it would allow more than
 *   the one origin intended or none at all.
 */
function bareOrigin(value: string, owner: string): string {
  const isBare =
    BARE_ORIGIN.test(value) &&
    URL.canParse(value) &&
    new URL(value).origin === value;
  if (!isBare) {
    throw new Error(
      `${owner}: "${value}" is not a bare https origin such as https://example.org.`,
    );
  }
  return value;
}

function basemapOrigins(basemap: BasemapDefinition): Origins {
  const owner = `basemap ${basemap.id}`;
  const { source } = basemap;
  switch (source.kind) {
    case "raster":
      return {
        connect: [originOf(source.tileUrl, owner)],
        image: [originOf(source.tileUrl, owner)],
      };
    case "vector":
      return {
        connect: [originOf(source.styleUrl, owner)],
        image: [originOf(source.styleUrl, owner)],
      };
    case "hybrid":
      return {
        connect: [
          originOf(source.tileUrl, owner),
          originOf(source.labelStyleUrl, owner),
        ],
        image: [
          originOf(source.tileUrl, owner),
          originOf(source.labelStyleUrl, owner),
        ],
      };
  }
}

function layerOrigins(definition: LayerDefinition): Origins {
  const owner = `layer ${definition.id}`;
  const controls = defaultControlValues(definition, SAMPLE_TIME);
  if (loadsFeatures(definition)) {
    const detail = "detail" in definition ? definition.detail : undefined;
    return {
      connect: [
        originOf(
          feedUrl(definition, controls, SAMPLE_TIME, SAMPLE_AREA),
          owner,
        ),
        ...(detail?.origins ?? []).map((origin) => bareOrigin(origin, owner)),
      ],
      image: [],
    };
  }
  const tiles = originOf(tileUrl(definition, controls, SAMPLE_TIME), owner);
  const identify = isIdentifiable(definition)
    ? [
        originOf(
          identifyUrl(definition, controls, SAMPLE_TIME, SAMPLE_TAP),
          owner,
        ),
      ]
    : [];
  return { connect: [tiles, ...identify], image: [tiles] };
}

function scriptSource(source: string): string {
  if (SOURCE_BREAKS.test(source)) {
    throw new Error(
      `script source "${source}" has a semicolon, comma or space in it.`,
    );
  }
  return source;
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
 * @throws When a definition's URL has no fixed https host, when a detail
 *   origin or a `connectOrigins` entry is not a bare https origin, or when a
 *   script source would break the directive.
 * @remarks A definition names only the first host it requests. A vector
 *   basemap's style brings sprites, glyphs and tile sets from hosts of its
 *   own, and a host's adapters name theirs in their own code, so pass those in
 *   `connectOrigins`.
 *   A basemap's tile and style origins go in both `img-src` and
 *   `connect-src`, as the reference host's policy has them; the repository
 *   does not say why the engine needs both, so neither is left out.
 */
export function buildContentSecurityPolicy(inputs: PolicyInputs): string {
  const origins = [
    ...inputs.basemaps.map(basemapOrigins),
    ...inputs.layers.map(layerOrigins),
  ];
  const image = origins.flatMap((entry) => entry.image);
  const connect = [
    ...origins.flatMap((entry) => entry.connect),
    ...(inputs.connectOrigins ?? []).map((origin) =>
      bareOrigin(origin, "connectOrigins"),
    ),
  ];
  return [
    `default-src ${SELF}`,
    `script-src ${[SELF, ...(inputs.scriptSources ?? []).map(scriptSource)].join(" ")}`,
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
