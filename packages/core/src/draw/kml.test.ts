// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { type KmlGeometry, type KmlReading, readKml } from "./kml";

function read(text: string): {
  result: KmlReading;
  geometries: KmlGeometry[];
} {
  const geometries: KmlGeometry[] = [];
  const result = readKml(text, (geometry) => {
    geometries.push(geometry);
    return true;
  });
  return { result, geometries };
}

const kml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">${body}</kml>`;

const placemark = (geometry: string) =>
  kml(`<Document><Placemark><name>n</name>${geometry}</Placemark></Document>`);

const ring = (coordinates: string) =>
  `<LinearRing><coordinates>${coordinates}</coordinates></LinearRing>`;

describe("readKml", () => {
  it("reads a point, longitude first, ignoring the altitude", () => {
    const { result, geometries } = read(
      placemark("<Point><coordinates>18.4,-33.9,12</coordinates></Point>"),
    );
    expect(result).toBe("ok");
    expect(geometries).toEqual([{ type: "Point", coordinates: [18.4, -33.9] }]);
  });

  it("reads a line from tuples separated by any white space", () => {
    const { geometries } = read(
      placemark(
        "<LineString><coordinates>\n  1,2,0 \t3,4\r\n5.5,-6e0,7\n</coordinates></LineString>",
      ),
    );
    expect(geometries).toEqual([
      {
        type: "LineString",
        coordinates: [
          [1, 2],
          [3, 4],
          [5.5, -6],
        ],
      },
    ]);
  });

  it("reads a polygon's outer ring and counts an empty ring for each inner boundary", () => {
    const { geometries } = read(
      placemark(
        `<Polygon><innerBoundaryIs>${ring("2,2 3,2 3,3 2,2")}</innerBoundaryIs><outerBoundaryIs>${ring("0,0 9,0 9,9 0,9 0,0")}</outerBoundaryIs><innerBoundaryIs>${ring("4,4 5,4 5,5 4,4")}</innerBoundaryIs></Polygon>`,
      ),
    );
    expect(geometries).toEqual([
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [9, 0],
            [9, 9],
            [0, 9],
            [0, 0],
          ],
          [],
          [],
        ],
      },
    ]);
  });

  it("gives a polygon with no outer boundary no rings", () => {
    const { geometries } = read(
      placemark("<Polygon><extrude>1</extrude></Polygon>"),
    );
    expect(geometries).toEqual([{ type: "Polygon", coordinates: [] }]);
  });

  it("reads a LinearRing standing alone as a line", () => {
    const { geometries } = read(placemark(ring("1,2 3,4 1,2")));
    expect(geometries.map((geometry) => geometry.type)).toEqual(["LineString"]);
  });

  it("flattens MultiGeometry, nested ones included, into one geometry per part", () => {
    const { geometries } = read(
      placemark(
        `<MultiGeometry><Point><coordinates>1,2</coordinates></Point><MultiGeometry><LineString><coordinates>1,2 3,4</coordinates></LineString><Polygon><outerBoundaryIs>${ring("0,0 1,0 1,1 0,0")}</outerBoundaryIs></Polygon></MultiGeometry></MultiGeometry>`,
      ),
    );
    expect(geometries.map((geometry) => geometry.type)).toEqual([
      "Point",
      "LineString",
      "Polygon",
    ]);
  });

  it("reads Placemarks directly under kml, and at any depth of Document and Folder, in file order", () => {
    const point = (lng: number) =>
      `<Placemark><Point><coordinates>${lng},0</coordinates></Point></Placemark>`;
    const { result, geometries } = read(
      kml(
        `${point(1)}<Document>${point(2)}<Folder><Folder>${point(3)}</Folder>${point(4)}</Folder></Document>${point(5)}`,
      ),
    );
    expect(result).toBe("ok");
    expect(
      geometries.map((geometry) =>
        geometry.type === "Point" ? geometry.coordinates[0] : null,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads elements with a namespace prefix and a prefixed root", () => {
    const { result, geometries } = read(
      '<k:kml xmlns:k="http://www.opengis.net/kml/2.2"><k:Placemark><k:Point><k:coordinates>1,2</k:coordinates></k:Point></k:Placemark></k:kml>',
    );
    expect(result).toBe("ok");
    expect(geometries).toEqual([{ type: "Point", coordinates: [1, 2] }]);
  });

  it("reads coordinates given as CDATA, and joins text split by a comment", () => {
    const { geometries } = read(
      placemark(
        "<LineString><coordinates><![CDATA[1,2 ]]>3<!-- c -->,4</coordinates></LineString>",
      ),
    );
    expect(geometries).toEqual([
      {
        type: "LineString",
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
    ]);
  });

  it("gives a position that is not a number for anything but plain decimals", () => {
    const nan = [Number.NaN, Number.NaN];
    const { geometries } = read(
      placemark(
        "<LineString><coordinates>1,2 &#49;,2 &lol9;,2 0x10,2 1, 2 1,2,x 1 1,2,3,4 1e2,2 ,2 1,</coordinates></LineString>",
      ),
    );
    expect(geometries).toEqual([
      {
        type: "LineString",
        coordinates: [
          [1, 2],
          nan,
          nan,
          nan,
          nan,
          nan,
          nan,
          nan,
          nan,
          [100, 2],
          nan,
          nan,
        ],
      },
    ]);
  });

  it("gives a point no usable position unless it has exactly one tuple", () => {
    for (const coordinates of ["", "1,2 3,4", "  "]) {
      const { geometries } = read(
        placemark(`<Point><coordinates>${coordinates}</coordinates></Point>`),
      );
      expect(geometries).toEqual([{ type: "Point", coordinates: [] }]);
    }
  });

  it("counts a gx:Track and a gx:MultiTrack once each, as not read", () => {
    const { result, geometries } = read(
      kml(
        `<Placemark><gx:Track><when>t</when><gx:coord>1 2 3</gx:coord></gx:Track></Placemark><Placemark><gx:MultiTrack><gx:Track><gx:coord>1 2</gx:coord></gx:Track><gx:Track><gx:coord>3 4</gx:coord></gx:Track></gx:MultiTrack></Placemark>`,
      ),
    );
    expect(result).toBe("ok");
    expect(geometries).toEqual([
      { type: "Unsupported" },
      { type: "Unsupported" },
    ]);
  });

  it("ignores NetworkLink, overlays, icons, styles, extended data and updates", () => {
    const { result, geometries } = read(
      kml(
        `<NetworkLink><name>n</name><Link><href>http://169.254.169.254/x.kml</href></Link></NetworkLink>
         <GroundOverlay><Icon><href>http://example.com/i.png</href></Icon><LatLonBox><north>1</north></LatLonBox></GroundOverlay>
         <Style><IconStyle><Icon><href>a.png</href></Icon></IconStyle></Style>
         <NetworkLinkControl><Update><Create><Placemark><Point><coordinates>9,9</coordinates></Point></Placemark></Create></Update></NetworkLinkControl>
         <Placemark><ExtendedData><Data><value><Point><coordinates>8,8</coordinates></Point></value></Data></ExtendedData></Placemark>
         <Placemark><Model><Location><coordinates>7,7</coordinates></Location></Model></Placemark>`,
      ),
    );
    expect(result).toBe("ok");
    expect(geometries).toEqual([]);
  });

  it("ignores names, descriptions and text between elements", () => {
    const { result, geometries } = read(
      placemark(
        "<description><![CDATA[<script>alert(1)</script>]]></description><Point><coordinates>1,2</coordinates></Point>",
      ),
    );
    expect(result).toBe("ok");
    expect(geometries).toHaveLength(1);
  });

  it("says when the text is not KML", () => {
    for (const text of [
      "<gpx/>",
      "<KML/>",
      "<kmlx/>",
      "plain",
      "<",
      "<!DOCTYPE kml [<!ENTITY a 'b'>]><kml/>",
      "x<kml/>",
      "<?xml version='1.0'?>",
      "<!-- only a comment -->",
      "PK\u0003\u0004\u0014\u0000\u0008\u0000doc.kml",
    ]) {
      expect(read(text).result, text).toBe("not-kml");
    }
  });

  it("does not expand an entity bomb", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><kml><Placemark><Point><coordinates>&b;,&b;</coordinates></Point></Placemark></kml>`;
    expect(read(bomb)).toEqual({ result: "not-kml", geometries: [] });
    const inside = read(
      placemark("<Point><coordinates>&b;&b;</coordinates></Point>"),
    );
    expect(inside.geometries).toEqual([
      { type: "Point", coordinates: [Number.NaN, Number.NaN] },
    ]);
  });

  it("says when the text is damaged", () => {
    for (const text of [
      "<kml>",
      "<kml><Placemark></kml>",
      "<kml></Placemark></kml>",
      "<kml/><kml/>",
      "<kml/>trailing",
      "<kml><Placemark><Point><coordinates>1,2</Point></Placemark></kml>",
      "<kml><Placemark><Point><coordinates>1,2",
      "<kml><Placemark><Point><coordinates><![CDATA[1,2</coordinates></Point></Placemark></kml>",
      "<kml><!-- open </kml>",
      "<kml><Placemark id='x></Placemark></kml>",
      "<kml><Placemark id=x/></kml>",
      "<kml",
      "<kml>text",
      "<kml><!x></kml>",
    ]) {
      expect(read(text).result, text).toBe("unreadable");
    }
  });

  it("refuses elements nested deeper than the cap, in linear time", () => {
    const deep = `<kml>${"<Folder>".repeat(40_000)}</kml>`;
    const started = performance.now();
    expect(read(deep).result).toBe("too-deep");
    expect(performance.now() - started).toBeLessThan(500);
    const nested = (levels: number) =>
      `<kml>${"<Folder>".repeat(levels)}${"</Folder>".repeat(levels)}</kml>`;
    expect(read(nested(31)).result).toBe("ok");
    expect(read(nested(32)).result).toBe("too-deep");
  });

  it("stops at once when the caller asks it to", () => {
    let seen = 0;
    const point =
      "<Placemark><Point><coordinates>1,2</coordinates></Point></Placemark>";
    expect(
      readKml(kml(point.repeat(3)), () => {
        seen += 1;
        return false;
      }),
    ).toBe("stopped");
    expect(seen).toBe(1);
    expect(
      readKml("<kml><Placemark><gx:Track/></Placemark></kml>", () => false),
    ).toBe("stopped");
  });

  it("walks hostile text in time that grows in proportion to its length", () => {
    const small = 10_000;
    const factor = 16;
    const builders: ((count: number) => string)[] = [
      (count) =>
        `<kml>${"<Placemark><Point><coordinates>1,2</coordinates></Point></Placemark>".repeat(count)}</kml>`,
      (count) =>
        `<kml><Placemark><LineString><coordinates>${"1,2 ".repeat(count)}</coordinates></LineString></Placemark></kml>`,
      (count) =>
        `<kml><Placemark><LineString><coordinates>${"<![CDATA[1,2 ]]><!-- x -->".repeat(count)}</coordinates></LineString></Placemark></kml>`,
      (count) => `<kml>${"<a></a>".repeat(count)}</kml>`,
      (count) => `<kml><Placemark ${'a="1" '.repeat(count)}/></kml>`,
      (count) =>
        `<kml><Placemark><Polygon>${"<innerBoundaryIs/>".repeat(count)}</Polygon></Placemark></kml>`,
    ];
    /** The fastest of a few runs, so a pause from other work does not count. */
    const fastest = (text: string) => {
      let best = Number.POSITIVE_INFINITY;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        readKml(text, () => true);
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };
    readKml(builders[0]?.(small) ?? "", () => true);
    for (const build of builders) {
      const base = fastest(build(small));
      const large = fastest(build(small * factor));
      expect(large / Math.max(base, 1)).toBeLessThan(factor * 4);
    }
  }, 60_000);
});
