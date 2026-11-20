// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The pure parts of the consumer check's browser leg (`browserRun.mjs`): the
 * policy the page is served under, the made-up style, which requests are
 * allowed, what a violation report says, and how a screenshot's pixel is read.
 * They are kept apart so unit tests can cover them without a browser.
 */
import path from "node:path";
import { inflateSync } from "node:zlib";

/**
 * A made-up origin for the one style document, so nothing on the page can
 * reach a real provider. The browser never resolves it: the leg answers the
 * request itself and refuses every other origin.
 */
export const STYLE_ORIGIN = "https://style.consumer-check.invalid";

/** The style document's address. */
export const BROWSER_STYLE_URL = `${STYLE_ORIGIN}/style.json`;

/** The colour the style's background layer paints, which the leg looks for in the drawn map. */
export const MAP_BACKGROUND = "#2e7d4f";

/**
 * The style the page's one basemap names: a background layer, and one inline
 * GeoJSON point, whose source makes the engine start its worker (as
 * `packages/web/e2e/support/network.ts` does). It names no URL, so no tile,
 * glyph or sprite is requested.
 */
export function consumerStyle() {
  return {
    version: 8,
    sources: {
      "worker-check": {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [0, 0] },
            },
          ],
        },
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": MAP_BACKGROUND },
      },
      { id: "worker-check", type: "circle", source: "worker-check" },
    ],
  };
}

/**
 * The Content-Security-Policy the page is served under: what
 * `buildContentSecurityPolicy` in `examples/embed` builds for a host whose one
 * basemap is {@link BROWSER_STYLE_URL} (a unit test keeps the two equal). The
 * script, style and worker directives are the strict ones
 * `docs/guides/content-security-policy.md` names: nothing inline, the engine's
 * worker from the page's own origin.
 *
 * @returns {string}
 */
export function browserPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: blob: ${STYLE_ORIGIN}`,
    "font-src 'self'",
    `connect-src 'self' ${STYLE_ORIGIN}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Where a request goes: the page's own origin (and `data:` and `blob:` URLs,
 * which make no network request), the one style document, or anywhere else,
 * which the leg refuses.
 *
 * @param {string} url The request's URL.
 * @param {string} pageOrigin The origin the page is served from.
 * @returns {"page" | "style" | "refused"}
 */
export function classifyRequest(url, pageOrigin) {
  if (url === BROWSER_STYLE_URL) {
    return "style";
  }
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return "page";
  }
  try {
    return new URL(url).origin === pageOrigin ? "page" : "refused";
  } catch {
    return "refused";
  }
}

/**
 * The problems with the requests a page made over a whole run: each one that
 * went somewhere the leg refuses.
 *
 * @param {string[]} urls Every request's URL.
 * @param {string} pageOrigin
 * @returns {string[]}
 */
export function requestProblems(urls, pageOrigin) {
  return urls
    .filter((url) => classifyRequest(url, pageOrigin) === "refused")
    .map(
      (url) =>
        `a request to ${url} was refused: the page may reach only its own origin and the made-up style`,
    );
}

/** The engine's own files: the main chunk and the worker. */
const ENGINE_FILE = /\/maplibre-gl[\w.-]*\.m?js(?:[?#]|$)/;

/**
 * The problems with the requests made before the page gave the adapter a
 * basemap: the adapter must make none, so a host that mounts it lazily loads
 * no style, no engine and no worker until then.
 *
 * @param {string[]} urls The requests made before the page's first basemap.
 * @param {string} pageOrigin
 * @returns {string[]}
 */
export function earlyRequestProblems(urls, pageOrigin) {
  return urls.flatMap((url) => {
    const where = classifyRequest(url, pageOrigin);
    if (where === "style" || where === "refused") {
      return [
        `${url} was requested before the page gave the adapter a basemap`,
      ];
    }
    return ENGINE_FILE.test(url)
      ? [
          `the engine file ${url} was fetched before the page gave the adapter a basemap`,
        ]
      : [];
  });
}

/**
 * The problems with the workers the page started: exactly the engine's
 * worker, served from the page's origin, which `worker-src 'self'` allows.
 *
 * @param {string[]} urls The URL of each worker the page started.
 * @param {string} pageOrigin
 * @returns {string[]}
 */
export function workerProblems(urls, pageOrigin) {
  if (urls.length === 0) {
    return ["no worker started, so the engine drew nothing under the policy"];
  }
  return urls
    .filter(
      (url) => !(url.startsWith(`${pageOrigin}/`) && ENGINE_FILE.test(url)),
    )
    .map(
      (url) =>
        `the worker ${url} is not the engine's worker from the page's own origin`,
    );
}

/**
 * The problems a page reported about itself: each security policy violation,
 * each console error and each uncaught error. Any one fails the leg.
 *
 * @param {{ violations: { violatedDirective: string, blockedURI: string }[], consoleErrors: string[], pageErrors: string[] }} reports
 * @returns {string[]}
 */
export function violationProblems({ violations, consoleErrors, pageErrors }) {
  return [
    ...violations.map(
      ({ violatedDirective, blockedURI }) =>
        `the policy refused ${blockedURI || "an inline source"} (${violatedDirective})`,
    ),
    ...consoleErrors.map((message) => `console error: ${message}`),
    ...pageErrors.map((message) => `uncaught error: ${message}`),
  ];
}

/** The PNG signature. */
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Bytes for each pixel by PNG colour type: RGB and RGBA, the two Chromium writes. */
const CHANNELS = { 2: 3, 6: 4 };

/** The Paeth predictor of PNG's filter 4. */
function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}

/**
 * The header and the joined image data of a PNG's chunks.
 *
 * @param {Buffer} bytes
 * @returns {{ header: Buffer, compressed: Buffer }}
 */
function pngChunks(bytes) {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("The screenshot is not a PNG.");
  }
  let header;
  const parts = [];
  for (let at = PNG_SIGNATURE.length; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      header = body;
    } else if (type === "IDAT") {
      parts.push(body);
    }
    at += 8 + length + 4;
  }
  if (header === undefined) {
    throw new Error("The PNG has no header.");
  }
  return { header, compressed: Buffer.concat(parts) };
}

/**
 * Undoes the filter of each scanline of a PNG's inflated data.
 *
 * @param {Buffer} raw One filter byte, then the filtered bytes, for each row.
 * @param {number} height
 * @param {number} stride Bytes in a row.
 * @param {number} channels Bytes in a pixel.
 * @returns {Buffer}
 */
function unfilter(raw, height, stride, channels) {
  const data = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    for (let column = 0; column < stride; column += 1) {
      const left =
        column >= channels ? data[row * stride + column - channels] : 0;
      const up = row > 0 ? data[(row - 1) * stride + column] : 0;
      const upLeft =
        row > 0 && column >= channels
          ? data[(row - 1) * stride + column - channels]
          : 0;
      const predicted = [
        0,
        left,
        up,
        Math.floor((left + up) / 2),
        paeth(left, up, upLeft),
      ][filter];
      if (predicted === undefined) {
        throw new Error(`The PNG uses an unknown filter, ${filter}.`);
      }
      data[row * stride + column] =
        (raw[row * (stride + 1) + 1 + column] + predicted) & 0xff;
    }
  }
  return data;
}

/**
 * Reads a PNG as a screenshot writes it: 8 bits a channel, RGB or RGBA, not
 * interlaced. Anything else throws, so the leg never reads colours off an
 * image it did not understand.
 *
 * @param {Buffer} bytes
 * @returns {{ width: number, height: number, channels: number, data: Buffer }}
 */
export function decodePng(bytes) {
  const { header, compressed } = pngChunks(bytes);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const channels = CHANNELS[header[9]];
  if (header[8] !== 8 || channels === undefined) {
    throw new Error(
      `The PNG is not 8-bit RGB or RGBA (depth ${header[8]}, colour type ${header[9]}).`,
    );
  }
  if (header[12] !== 0) {
    throw new Error("The PNG is interlaced.");
  }
  const raw = inflateSync(compressed);
  const stride = width * channels;
  if (raw.length !== height * (stride + 1)) {
    throw new Error("The PNG's data is not the size its header gives.");
  }
  return {
    width,
    height,
    channels,
    data: unfilter(raw, height, stride, channels),
  };
}

/**
 * One pixel of a decoded image.
 *
 * @param {{ width: number, height: number, channels: number, data: Buffer }} image
 * @param {number} x
 * @param {number} y
 * @returns {[number, number, number, number]} Red, green, blue and alpha.
 */
export function pixelAt(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new Error(
      `The pixel (${x}, ${y}) is outside the ${image.width} by ${image.height} image.`,
    );
  }
  const at = (y * image.width + x) * image.channels;
  return [
    image.data[at],
    image.data[at + 1],
    image.data[at + 2],
    image.channels === 4 ? image.data[at + 3] : 255,
  ];
}

/** What an element with no background computes to. */
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** How far a channel may differ from the style's colour: the rounding of a drawn frame. */
const CHANNEL_TOLERANCE = 2;

/**
 * The problem with a pixel that should have the style's background colour.
 *
 * @param {[number, number, number, number]} pixel Red, green, blue and alpha.
 * @param {string} hex The colour, as `#rrggbb`.
 * @returns {string[]}
 */
export function colourProblems(pixel, hex) {
  const wanted = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16),
  );
  const matches =
    pixel[3] === 255 &&
    wanted.every(
      (channel, index) => Math.abs(channel - pixel[index]) <= CHANNEL_TOLERANCE,
    );
  return matches
    ? []
    : [
        `the map region's pixel is (${pixel.join(", ")}), not the style's background ${hex}, so the engine drew no frame`,
      ];
}

/** The content types a built page and its worker need. */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

/**
 * The content type a static server answers a file with.
 *
 * @param {string} file
 * @returns {string}
 */
export function contentTypeOf(file) {
  return CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
}

/**
 * The file a static server reads for a request path, or undefined when the
 * path is not one it may read: it is not decodable, holds a null byte, or
 * leaves the folder it serves.
 *
 * @param {string} root The folder served.
 * @param {string} requestPath The path and query of the request.
 * @returns {string | undefined}
 */
export function staticFile(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split(/[?#]/)[0]);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) {
    return undefined;
  }
  const target = path.join(
    root,
    decoded.endsWith("/") ? `${decoded}index.html` : decoded,
  );
  return target.startsWith(`${root}${path.sep}`) ? target : undefined;
}

/**
 * The problems with how the engine's container and controls are styled. The
 * probe is an element the page gives the map background token, so the token
 * stylesheet must have resolved to a colour: a page with no stylesheet gives a
 * transparent probe and a transparent container, which must not pass for equal.
 *
 * @param {{ container: string | null, probe: string | null, controls: string | null }} computed Computed values.
 * @returns {string[]}
 */
export function engineStyleProblems({ container, probe, controls }) {
  const problems = [];
  if (!probe || probe === TRANSPARENT) {
    problems.push(
      `the map background token did not resolve to a colour (${probe || "empty"}), so the token stylesheet did not reach the page`,
    );
  } else if (container !== probe) {
    problems.push(
      `the engine container's background is ${container}, not the map background token (${probe}), so the engine styles did not reach the page`,
    );
  }
  if (controls !== "none") {
    problems.push(
      `the engine's control container shows (display ${controls}), so the engine styles did not reach the page`,
    );
  }
  return problems;
}
