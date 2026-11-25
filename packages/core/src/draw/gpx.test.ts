// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { type GpxGeometry, type GpxReading, readGpx } from "./gpx";

function read(text: string): {
  result: GpxReading;
  geometries: GpxGeometry[];
} {
  const geometries: GpxGeometry[] = [];
  const result = readGpx(text, (geometry) => {
    geometries.push(geometry);
    return true;
  });
  return { result, geometries };
}

const gpx = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;

describe("readGpx", () => {
  it("reads waypoints as points, longitude first", () => {
    const { result, geometries } = read(
      gpx(
        '<wpt lat="-33.9" lon="18.4"><name>Cape &amp; Town</name></wpt><wpt lat="1" lon="2"/>',
      ),
    );
    expect(result).toBe("ok");
    expect(geometries).toEqual([
      { type: "Point", coordinates: [18.4, -33.9] },
      { type: "Point", coordinates: [2, 1] },
    ]);
  });

  it("reads a route as one line", () => {
    const { geometries } = read(
      gpx(
        '<rte><name>r</name><rtept lat="1" lon="2"><ele>5</ele></rtept><rtept lat="3" lon="4"/></rte>',
      ),
    );
    expect(geometries).toEqual([
      {
        type: "LineString",
        coordinates: [
          [2, 1],
          [4, 3],
        ],
      },
    ]);
  });

  it("reads each track segment as a line of its own", () => {
    const { geometries } = read(
      gpx(
        `<trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/></trkseg>
         <trkseg><trkpt lat="5" lon="6"/><trkpt lat="7" lon="8"/></trkseg></trk>
         <trk><trkseg><trkpt lat="9" lon="10"/></trkseg></trk>`,
      ),
    );
    expect(geometries.map((geometry) => geometry.type)).toEqual([
      "LineString",
      "LineString",
      "LineString",
    ]);
    expect(geometries[1]?.coordinates).toEqual([
      [6, 5],
      [8, 7],
    ]);
  });

  it("accepts single quotes, white space around the equals sign and a byte order mark", () => {
    const { result, geometries } = read(
      `﻿  \n<gpx><wpt lat = '1' lon\n=\n"2"></wpt></gpx>`,
    );
    expect(result).toBe("ok");
    expect(geometries).toEqual([{ type: "Point", coordinates: [2, 1] }]);
  });

  it("ignores comments, CDATA, processing instructions, unknown elements and mixed text", () => {
    const { result, geometries } = read(
      `<!-- lead --><gpx>text <!-- <wpt lat="9" lon="9"/> -->
       <metadata><desc><![CDATA[<wpt lat="8" lon="8"/>]]></desc></metadata>
       <?pi <wpt lat="7" lon="7"/> ?>
       <extensions><wpt lat="6" lon="6"/><x:wpt lat="5" lon="5"/></extensions>
       <wpt lat="1" lon="2"><extensions><wpt lat="4" lon="4"/></extensions></wpt>tail</gpx> <!-- end -->`,
    );
    expect(result).toBe("ok");
    expect(geometries).toEqual([{ type: "Point", coordinates: [2, 1] }]);
  });

  it("reads a leading plus sign, as the GPX schema's decimal allows", () => {
    const { geometries } = read(
      gpx('<wpt lat="+51.5" lon="+0.1"/><wpt lat="-1" lon="+2"/>'),
    );
    expect(geometries.map((geometry) => geometry.coordinates)).toEqual([
      [0.1, 51.5],
      [2, -1],
    ]);
  });

  it("gives a point whose position is not a plain decimal a position no shape can use", () => {
    const bad = [
      "&#49;",
      "",
      "++1",
      "+",
      "+-1",
      "0x1",
      "1e1",
      "1.",
      ".5",
      " 1",
    ];
    const { geometries } = read(
      gpx(
        bad.map((lat) => `<wpt lat="${lat}" lon="2"/>`).join("") +
          '<wpt lon="2"/>',
      ),
    );
    expect(geometries).toHaveLength(bad.length + 1);
    for (const geometry of geometries) {
      expect(geometry.coordinates).toEqual([2, Number.NaN]);
    }
  });

  it("never expands an entity or follows an external reference", () => {
    const laughs = Array.from(
      { length: 9 },
      (_, level) => `<!ENTITY lol${level + 1} "${`&lol${level};`.repeat(10)}">`,
    ).join("");
    const doctype = `<!DOCTYPE gpx [<!ENTITY lol "lol">${laughs}<!ENTITY x SYSTEM "file:///etc/passwd">]>`;
    const document =
      '<gpx><wpt lat="1" lon="2"><name>&lol9;</name></wpt></gpx>';
    expect(read(document).result).toBe("ok");
    expect(read(`${doctype}${document}`)).toEqual({
      result: "not-gpx",
      geometries: [],
    });
    const { geometries } = read(
      gpx('<wpt lat="&lol9;" lon="&x;"/><wpt lat="1" lon="2"/>'),
    );
    expect(geometries[0]?.coordinates).toEqual([Number.NaN, Number.NaN]);
    expect(geometries[1]?.coordinates).toEqual([2, 1]);
  });

  it("says when the text is not GPX", () => {
    for (const text of [
      "<kml><Placemark/></kml>",
      "<GPX/>",
      "<gpxx/>",
      "<ns:gpx><ns:wpt lat='1' lon='2'/></ns:gpx>",
      "plain",
      "<",
      "<!DOCTYPE gpx><gpx/>",
      "x<gpx/>",
      "<?xml version='1.0'?>",
      "<!-- only a comment -->",
    ]) {
      expect(read(text).result).toBe("not-gpx");
    }
  });

  it("says when the text is damaged", () => {
    for (const text of [
      "<gpx>",
      "<gpx><wpt lat='1' lon='2'></gpx>",
      "<gpx></wpt></gpx>",
      "<gpx/><gpx/>",
      "<gpx/>trailing",
      "<gpx><wpt lat='1' lon='2></gpx>",
      "<gpx><wpt lat=1 lon=2/></gpx>",
      "<gpx><!-- open </gpx>",
      "<gpx><![CDATA[ open </gpx>",
      "<gpx><? open </gpx>",
      "<gpx><wpt lat='1' lon></gpx>",
      "<gpx <wpt/> </gpx>",
      "<gpx></ gpx>",
      "<gpx",
      "<gpx>text",
      "<gpx/>x",
      "<gpx/> x",
      "<gpx><!x></gpx>",
    ]) {
      expect(read(text).result, text).toBe("unreadable");
    }
  });

  it("refuses elements nested deeper than the cap, in linear time", () => {
    const deep = `<gpx>${"<a>".repeat(40_000)}</gpx>`;
    const started = performance.now();
    expect(read(deep).result).toBe("too-deep");
    expect(performance.now() - started).toBeLessThan(500);
    expect(
      read(`<gpx>${"<a>".repeat(30)}${"</a>".repeat(30)}</gpx>`).result,
    ).toBe("ok");
  });

  it("stops at once when the caller asks it to", () => {
    let seen = 0;
    const result = readGpx(
      gpx('<wpt lat="1" lon="2"/><wpt lat="1" lon="2"/><wpt lat="1" lon="2"/>'),
      () => {
        seen += 1;
        return false;
      },
    );
    expect(result).toBe("stopped");
    expect(seen).toBe(1);
  });

  it("stops at a line that a self-closing element ends", () => {
    expect(readGpx("<gpx><rte/><rte/></gpx>", () => false)).toBe("stopped");
  });

  it("ignores elements with a namespace prefix", () => {
    const { geometries } = read(
      gpx('<gpx:wpt lat="1" lon="2"/><wpt lat="3" lon="4"/>'),
    );
    expect(geometries).toEqual([{ type: "Point", coordinates: [4, 3] }]);
  });

  it("matches point paths exactly, not by their ending", () => {
    const { geometries } = read(
      '<gpx><rte><trkpt lat="1" lon="2"/><extensions><rtept lat="3" lon="4"/></extensions></rte></gpx>',
    );
    expect(geometries).toEqual([{ type: "LineString", coordinates: [] }]);
  });

  it("stops at a line that an end tag finishes", () => {
    expect(readGpx("<gpx><rte></rte><rte>", () => false)).toBe("stopped");
  });

  it("allows 31 levels of elements inside gpx and no more", () => {
    const nested = (levels: number) =>
      `<gpx>${"<a>".repeat(levels)}${"</a>".repeat(levels)}</gpx>`;
    expect(read(nested(31)).result).toBe("ok");
    expect(read(nested(32)).result).toBe("too-deep");
    expect(read(nested(33)).result).toBe("too-deep");
    expect(read(nested(30)).result).toBe("ok");
  });

  it("walks hostile text in time that grows in proportion to its length", () => {
    const small = 10_000;
    const factor = 16;
    const builders: ((count: number) => string)[] = [
      (count) => `<gpx>${'<wpt lat="1" lon="2"/>'.repeat(count)}</gpx>`,
      (count) => `<gpx>${"<a></a>".repeat(count)}</gpx>`,
      (count) => `<gpx>${"<!-- x -->".repeat(count)}</gpx>`,
      (count) => `<gpx>${"<![CDATA[ x ]]>".repeat(count)}</gpx>`,
      (count) => `<gpx><wpt ${'a="1" '.repeat(count)}/></gpx>`,
      (count) => `<gpx>${"<a>".repeat(30)}${"<b/>".repeat(count)}</gpx>`,
    ];
    /** The fastest of a few runs, so a pause from other work does not count. */
    const fastest = (text: string) => {
      let best = Number.POSITIVE_INFINITY;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        readGpx(text, () => true);
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };
    readGpx(builders[0]?.(small) ?? "", () => true);
    for (const build of builders) {
      const base = fastest(build(small));
      const large = fastest(build(small * factor));
      // Linear growth is a factor of 16 and quadratic 256: a bound four times
      // the linear one holds under load and still catches quadratic work.
      expect(large / Math.max(base, 1)).toBeLessThan(factor * 4);
    }
  }, 30_000);
});
