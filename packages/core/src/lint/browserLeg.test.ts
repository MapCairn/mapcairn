// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import path from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../../../../examples/embed/src/contentSecurityPolicy";
import {
  BROWSER_STYLE_URL,
  browserPolicy,
  classifyRequest,
  colourProblems,
  consumerStyle,
  contentTypeOf,
  decodePng,
  earlyRequestProblems,
  engineStyleProblems,
  MAP_BACKGROUND,
  pixelAt,
  requestProblems,
  STYLE_ORIGIN,
  staticFile,
  violationProblems,
  workerProblems,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/browserLeg.mjs";

const PAGE = "http://127.0.0.1:4196";

/** The bytes of a PNG with the given scanlines, each already filtered. */
function png(
  width: number,
  height: number,
  colourType: number,
  scanlines: Buffer[],
): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    // The checksum is not read by the decoder under test.
    return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colourType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(scanlines))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("the browser leg's policy", () => {
  it("is the policy the embed example builds for a host whose one basemap is the made-up style", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [
        {
          id: "consumer-check",
          name: "Consumer check",
          source: { kind: "vector", styleUrl: BROWSER_STYLE_URL },
          minZoom: 0,
          maxZoom: 22,
          attribution: [],
          appearance: "light",
        },
      ],
      layers: [],
    });
    expect(browserPolicy()).toBe(policy);
  });

  it("allows no inline script and the worker from the page's own origin", () => {
    const policy = browserPolicy();
    expect(policy).toMatch(/script-src 'self'(;|$)/);
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).toContain("worker-src 'self' blob:");
  });

  it("lets the page connect to the made-up style origin and no other", () => {
    expect(browserPolicy()).toContain(`connect-src 'self' ${STYLE_ORIGIN}`);
    expect(browserPolicy().match(/https:\/\/[^\s;]+/g)).toEqual([
      STYLE_ORIGIN,
      STYLE_ORIGIN,
    ]);
  });
});

describe("the made-up style", () => {
  const style = consumerStyle();

  it("has a background layer in the colour the leg looks for", () => {
    expect(style.layers[0]).toMatchObject({
      type: "background",
      paint: { "background-color": MAP_BACKGROUND },
    });
  });

  it("has one inline GeoJSON point, which makes the engine start its worker", () => {
    expect(Object.values(style.sources)).toEqual([
      expect.objectContaining({ type: "geojson" }),
    ]);
  });

  it("names no other origin", () => {
    expect(JSON.stringify(style)).not.toMatch(/https?:/);
  });
});

describe("classifyRequest", () => {
  it("lets the page's own origin through", () => {
    expect(classifyRequest(`${PAGE}/assets/index.js`, PAGE)).toBe("page");
  });

  it("answers the made-up style, and only that URL, from the mock", () => {
    expect(classifyRequest(BROWSER_STYLE_URL, PAGE)).toBe("style");
    expect(classifyRequest(`${STYLE_ORIGIN}/other.json`, PAGE)).toBe("refused");
  });

  it("refuses every other origin, including a look-alike of the page's", () => {
    expect(classifyRequest("https://tiles.example/1/2/3.pbf", PAGE)).toBe(
      "refused",
    );
    expect(classifyRequest("http://127.0.0.1:4197/", PAGE)).toBe("refused");
    expect(classifyRequest(`${PAGE}.evil.example/`, PAGE)).toBe("refused");
  });

  it("treats data and blob URLs as the page's own", () => {
    expect(classifyRequest("data:image/png;base64,AAAA", PAGE)).toBe("page");
    expect(classifyRequest("blob:http://127.0.0.1:4196/uuid", PAGE)).toBe(
      "page",
    );
  });
});

describe("requestProblems", () => {
  it("has none when every request is the page's or the style's", () => {
    expect(requestProblems([`${PAGE}/`, BROWSER_STYLE_URL], PAGE)).toEqual([]);
  });

  it("names each refused request", () => {
    const problems = requestProblems(
      [`${PAGE}/`, "https://tiles.example/a", "https://fonts.example/b"],
      PAGE,
    );
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("https://tiles.example/a");
    expect(problems.join("\n")).toContain("https://fonts.example/b");
  });
});

describe("earlyRequestProblems", () => {
  it("has none for the page and its own scripts before a basemap is given", () => {
    expect(
      earlyRequestProblems([`${PAGE}/`, `${PAGE}/assets/index-abc.js`], PAGE),
    ).toEqual([]);
  });

  it("names a style request made before the page gave a basemap", () => {
    expect(earlyRequestProblems([BROWSER_STYLE_URL], PAGE)).toEqual([
      expect.stringContaining(BROWSER_STYLE_URL),
    ]);
  });

  it("names a worker or engine file fetched before the page gave a basemap", () => {
    expect(
      earlyRequestProblems([`${PAGE}/assets/maplibre-gl-worker-abc.js`], PAGE),
    ).toHaveLength(1);
    expect(
      earlyRequestProblems([`${PAGE}/assets/maplibre-gl-abc.js`], PAGE),
    ).toHaveLength(1);
  });
});

describe("workerProblems", () => {
  it("accepts the engine worker served from the page's origin", () => {
    expect(
      workerProblems([`${PAGE}/assets/maplibre-gl-worker-abc.js`], PAGE),
    ).toEqual([]);
  });

  it("fails when no worker started", () => {
    expect(workerProblems([], PAGE)).toEqual([
      expect.stringMatching(/no worker/i),
    ]);
  });

  it("fails for a worker from another origin or a blob", () => {
    expect(
      workerProblems(["https://cdn.example/maplibre-gl-worker.js"], PAGE),
    ).toHaveLength(1);
    expect(workerProblems([`blob:${PAGE}/uuid`], PAGE)).toHaveLength(1);
  });
});

describe("violationProblems", () => {
  it("has none for a quiet page", () => {
    expect(
      violationProblems({ violations: [], consoleErrors: [], pageErrors: [] }),
    ).toEqual([]);
  });

  it("names a policy violation with its directive and the blocked address", () => {
    const [problem] = violationProblems({
      violations: [
        { violatedDirective: "worker-src", blockedURI: "blob:null/abc" },
      ],
      consoleErrors: [],
      pageErrors: [],
    });
    expect(problem).toContain("worker-src");
    expect(problem).toContain("blob:null/abc");
  });

  it("names console errors and uncaught errors too", () => {
    const problems = violationProblems({
      violations: [],
      consoleErrors: ["Refused to create a worker"],
      pageErrors: ["TypeError: x is not a function"],
    });
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("Refused to create a worker");
    expect(problems.join("\n")).toContain("TypeError");
  });
});

describe("decodePng and pixelAt", () => {
  it("reads an RGB pixel from an unfiltered scanline", () => {
    const image = decodePng(
      png(2, 1, 2, [Buffer.from([0, 10, 20, 30, 40, 50, 60])]),
    );
    expect(image).toMatchObject({ width: 2, height: 1 });
    expect(pixelAt(image, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(image, 1, 0)).toEqual([40, 50, 60, 255]);
  });

  it("reads an RGBA pixel", () => {
    const image = decodePng(png(1, 1, 6, [Buffer.from([0, 1, 2, 3, 128])]));
    expect(pixelAt(image, 0, 0)).toEqual([1, 2, 3, 128]);
  });

  it("undoes the Sub, Up, Average and Paeth filters", () => {
    // Two RGB pixels per row, two rows, each row with a different filter.
    const image = decodePng(
      png(2, 4, 2, [
        Buffer.from([1, 10, 20, 30, 5, 5, 5]), // Sub: second pixel adds the first
        Buffer.from([2, 1, 1, 1, 1, 1, 1]), // Up: adds the row above
        Buffer.from([3, 2, 2, 2, 2, 2, 2]), // Average
        Buffer.from([4, 1, 1, 1, 1, 1, 1]), // Paeth
      ]),
    );
    expect(pixelAt(image, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(image, 1, 0)).toEqual([15, 25, 35, 255]);
    expect(pixelAt(image, 0, 1)).toEqual([11, 21, 31, 255]);
    expect(pixelAt(image, 1, 1)).toEqual([16, 26, 36, 255]);
    // Average: floor((left + up) / 2) + raw; the left of the first pixel is 0.
    expect(pixelAt(image, 0, 2)).toEqual([2 + 5, 2 + 10, 2 + 15, 255]);
    // Paeth of a pixel with the one above (b) and nothing to the left (a = 0, c = 0) picks b.
    expect(pixelAt(image, 0, 3)).toEqual([1 + 7, 1 + 12, 1 + 17, 255]);
  });

  it("refuses an image it cannot read, rather than reading garbage", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(/PNG/);
    const interlaced = png(1, 1, 2, [Buffer.from([0, 1, 2, 3])]);
    // Signature (8), chunk length and type (8), then the header's last byte.
    interlaced[8 + 8 + 12] = 1;
    expect(() => decodePng(interlaced)).toThrow(/interlaced/i);
  });

  it("refuses a pixel outside the image", () => {
    const image = decodePng(png(1, 1, 2, [Buffer.from([0, 1, 2, 3])]));
    expect(() => pixelAt(image, 1, 0)).toThrow(/outside/);
  });
});

describe("colourProblems", () => {
  it("accepts the colour the style paints, to within the rounding of a drawn frame", () => {
    expect(colourProblems([0x2e, 0x7d, 0x4f, 255], MAP_BACKGROUND)).toEqual([]);
    expect(colourProblems([0x2f, 0x7c, 0x50, 255], MAP_BACKGROUND)).toEqual([]);
  });

  it("names the pixel it found when the colour is something else", () => {
    const [problem] = colourProblems([255, 255, 255, 255], MAP_BACKGROUND);
    expect(problem).toContain("255, 255, 255");
    expect(problem).toContain(MAP_BACKGROUND);
  });

  it("fails an empty (transparent) pixel, which is what an undrawn canvas gives", () => {
    expect(colourProblems([0, 0, 0, 0], MAP_BACKGROUND)).toHaveLength(1);
  });
});

describe("staticFile", () => {
  const root = path.resolve("/srv/app");

  it("serves the page for the root and a folder", () => {
    expect(staticFile(root, "/")).toBe(path.join(root, "index.html"));
    expect(staticFile(root, "/sub/")).toBe(
      path.join(root, "sub", "index.html"),
    );
  });

  it("serves a file under the root, without its query", () => {
    expect(staticFile(root, "/assets/a.js?v=1")).toBe(
      path.join(root, "assets", "a.js"),
    );
  });

  it("refuses a path that climbs out of the root, however it is written", () => {
    expect(staticFile(root, "/../secret")).toBeUndefined();
    expect(staticFile(root, "/%2e%2e/secret")).toBeUndefined();
    expect(staticFile(root, "/a/..%2f..%2fsecret")).toBeUndefined();
  });

  it("refuses a path it cannot read", () => {
    expect(staticFile(root, "/%zz")).toBeUndefined();
    expect(staticFile(root, "/a\0b")).toBeUndefined();
  });
});

describe("contentTypeOf", () => {
  it("names the types a built page needs, so a module script and a worker load", () => {
    expect(contentTypeOf("index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeOf("a.js")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeOf("a.mjs")).toBe("text/javascript; charset=utf-8");
    expect(contentTypeOf("a.css")).toBe("text/css; charset=utf-8");
    expect(contentTypeOf("a.json")).toBe("application/json");
  });

  it("falls back to a type that is never run", () => {
    expect(contentTypeOf("a.bin")).toBe("application/octet-stream");
  });
});

describe("engineStyleProblems", () => {
  const token = "rgb(248, 244, 240)";

  it("accepts a container with the token's colour and hidden controls", () => {
    expect(
      engineStyleProblems({ container: token, probe: token, controls: "none" }),
    ).toEqual([]);
  });

  it("fails a container that is not the token's colour", () => {
    expect(
      engineStyleProblems({
        container: "rgba(0, 0, 0, 0)",
        probe: token,
        controls: "none",
      }),
    ).toHaveLength(1);
  });

  it("fails when the token itself did not resolve, so a missing stylesheet cannot match itself", () => {
    const transparent = "rgba(0, 0, 0, 0)";
    expect(
      engineStyleProblems({
        container: transparent,
        probe: transparent,
        controls: "none",
      }),
    ).toHaveLength(1);
    expect(
      engineStyleProblems({ container: "", probe: "", controls: "none" }),
    ).toHaveLength(1);
  });

  it("fails controls that show", () => {
    expect(
      engineStyleProblems({
        container: token,
        probe: token,
        controls: "block",
      }),
    ).toHaveLength(1);
  });
});
