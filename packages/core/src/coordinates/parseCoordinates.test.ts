import { describe, expect, it } from "vitest";
import {
  MAX_COORDINATE_TEXT_LENGTH,
  parseCoordinates,
} from "./parseCoordinates";

const JOHANNESBURG = { lat: -26.2041, lng: 28.0473 };
const JOHANNESBURG_DMS = { lat: -26.2041111, lng: 28.0473056 };

describe("parseCoordinates", () => {
  describe("decimal degrees", () => {
    it.each([
      ["-26.2041, 28.0473", JOHANNESBURG],
      ["-26.2041,28.0473", JOHANNESBURG],
      ["-26.2041 28.0473", JOHANNESBURG],
      ["  -26.2041 ,  28.0473  ", JOHANNESBURG],
      ["-26.2041; 28.0473", JOHANNESBURG],
      ["-26.2041\t28.0473", JOHANNESBURG],
      ["-26.2041° 28.0473°", JOHANNESBURG],
      ["-26.2041 degrees, 28.0473 degrees", JOHANNESBURG],
      ["+26.2041, +28.0473", { lat: 26.2041, lng: 28.0473 }],
      ["−26.2041, 28.0473", JOHANNESBURG],
      ["-26.0, 28.0", { lat: -26, lng: 28 }],
      ["26.2 28.1", { lat: 26.2, lng: 28.1 }],
      ["0.0 0.0", { lat: 0, lng: 0 }],
      ["-0.0, -0.0", { lat: 0, lng: 0 }],
      ["–26.2041, 28.0473", JOHANNESBURG],
      ["26.2041 –28.0473", { lat: 26.2041, lng: -28.0473 }],
      ["51.5, -0.12", { lat: 51.5, lng: -0.12 }],
      [".5 .25", { lat: 0.5, lng: 0.25 }],
      ["90.0, 180.0", { lat: 90, lng: 180 }],
      ["-90.0, -180.0", { lat: -90, lng: -180 }],
      ["-26.2041,-28.0473", { lat: -26.2041, lng: -28.0473 }],
      ["-26° -28°", { lat: -26, lng: -28 }],
      ["26°-28°", { lat: 26, lng: -28 }],
    ])("reads %j", (text, expected) => {
      expect(parseCoordinates(text)).toEqual(expected);
    });

    it("keeps the sign of a value that is not zero", () => {
      expect(parseCoordinates("-0.0000001 0.0")).toEqual({
        lat: -0.0000001,
        lng: 0,
      });
    });

    it("rounds to a centimetre so floating point noise does not show", () => {
      expect(parseCoordinates("-26.123456789 28.987654321")).toEqual({
        lat: -26.1234568,
        lng: 28.9876543,
      });
    });

    it("reads the first value as latitude and never swaps a pair", () => {
      expect(parseCoordinates("28.0473, -26.2041")).toEqual({
        lat: 28.0473,
        lng: -26.2041,
      });
      expect(parseCoordinates("120, 45")).toBeNull();
    });
  });

  describe("hemisphere letters", () => {
    it.each([
      ["26.2041S 28.0473E", JOHANNESBURG],
      ["26.2041 S 28.0473 E", JOHANNESBURG],
      ["26.2041° S, 28.0473° E", JOHANNESBURG],
      ["26.2041°S,28.0473°E", JOHANNESBURG],
      ["S26.2041 E28.0473", JOHANNESBURG],
      ["S 26.2041, E 28.0473", JOHANNESBURG],
      ["S26.2041° E28.0473°", JOHANNESBURG],
      ["s26.2041 e28.0473", JOHANNESBURG],
      ["26.2041s 28.0473e", JOHANNESBURG],
      ["26.2041 south, 28.0473 east", JOHANNESBURG],
      ["South 26.2041 East 28.0473", JOHANNESBURG],
      ["N 26.2041 W 28.0473", { lat: 26.2041, lng: -28.0473 }],
      ["26.2041 N 28.0473 W", { lat: 26.2041, lng: -28.0473 }],
      ["N26.2041 W28.0473", { lat: 26.2041, lng: -28.0473 }],
      ["51.5N 0.12W", { lat: 51.5, lng: -0.12 }],
      ["26.0S 28.0E", { lat: -26, lng: 28 }],
      ["26°S 28°E", { lat: -26, lng: 28 }],
      ["90.0N 180.0E", { lat: 90, lng: 180 }],
      ["90.0S 180.0W", { lat: -90, lng: -180 }],
      ["0.0N 0.0E", { lat: 0, lng: 0 }],
      ["0.0S 0.0W", { lat: 0, lng: 0 }],
    ])("reads %j", (text, expected) => {
      expect(parseCoordinates(text)).toEqual(expected);
    });

    it("lets the letters put longitude first", () => {
      expect(parseCoordinates("28.0473E 26.2041S")).toEqual(JOHANNESBURG);
      expect(parseCoordinates("E28.0473 S26.2041")).toEqual(JOHANNESBURG);
      expect(parseCoordinates("28.0473 E, 26.2041 S")).toEqual(JOHANNESBURG);
    });

    it("gives the other value the other axis when only one has a letter", () => {
      expect(parseCoordinates("26.2041 S, 28.0473")).toEqual(JOHANNESBURG);
      expect(parseCoordinates("-26.2041, 28.0473 E")).toEqual(JOHANNESBURG);
      expect(parseCoordinates("28.0473 E, 26.2041")).toEqual({
        lat: 26.2041,
        lng: 28.0473,
      });
      expect(parseCoordinates("28.0473, 26.2041 N")).toEqual({
        lat: 26.2041,
        lng: 28.0473,
      });
    });

    it.each([
      "26.2041N 28.0473S",
      "26.2041E 28.0473W",
      "26.2041S 28.0473S",
      "-26.2041S 28.0473E",
      "26.2041 28.0473S E",
      "S26.2041S 28.0473E",
      "S26.2041 N28.0473",
      "N S 26 28",
      "S 28.0473E",
      "S E",
      "N",
    ])("refuses %j", (text) => {
      expect(parseCoordinates(text)).toBeNull();
    });
  });

  describe("degrees, minutes and seconds", () => {
    it.each([
      [`26°12'14.8"S 28°02'50.3"E`, JOHANNESBURG_DMS],
      [`26° 12' 14.8" S, 28° 2' 50.3" E`, JOHANNESBURG_DMS],
      [`S26°12'14.8" E28°02'50.3"`, JOHANNESBURG_DMS],
      [`26º12′14.8″S 28º02′50.3″E`, JOHANNESBURG_DMS],
      [`26˚12’14.8”S 28˚02’50.3”E`, JOHANNESBURG_DMS],
      [`26°12'14.8''S 28°02'50.3''E`, JOHANNESBURG_DMS],
      [`26°12'14.8"S,28°02'50.3"E`, JOHANNESBURG_DMS],
      [`-26°12'14.8" 28°02'50.3"`, JOHANNESBURG_DMS],
      [
        "26 degrees 12 minutes 14.8 seconds south, 28 degrees 2 minutes 50.3 seconds east",
        JOHANNESBURG_DMS,
      ],
      ["26 deg 12 min 14.8 sec S 28 deg 2 min 50.3 sec E", JOHANNESBURG_DMS],
      [`26°12.2468'S 28°2.8383'E`, { lat: -26.2041133, lng: 28.047305 }],
      [`26°12'S 28°3'E`, { lat: -26.2, lng: 28.05 }],
      [`26°S 28°E`, { lat: -26, lng: 28 }],
      [`26°30'N 28°0'0"E`, { lat: 26.5, lng: 28 }],
      [`0°30'S 0°0'0"E`, { lat: -0.5, lng: 0 }],
      [`-0°30' 0°30'`, { lat: -0.5, lng: 0.5 }],
      [`90°0'0"N 180°0'0"E`, { lat: 90, lng: 180 }],
      [`89°59'59.9999"S 179°59'59.9999"W`, { lat: -90, lng: -180 }],
    ])("reads %j", (text, expected) => {
      expect(parseCoordinates(text)).toEqual(expected);
    });

    it.each([
      `26°60'0"S 28°0'0"E`,
      `26°12'60"S 28°0'0"E`,
      `26°12.5'30"S 28°0'0"E`,
      `26.5°12'S 28°0'0"E`,
      `26.5°12'14"S 28°0'0"E`,
      `26°14.8"S 28°0'0"E`,
      `26°12''14.8''S 28°0'0"E`,
      `90°0'1"N 28°0'0"E`,
      `26°0'0"S 180°0'1"E`,
      `26°12'14.8"S 28°02'50.3"E 5`,
      `26'12"S 28°E`,
      `26°°S 28°E`,
      `26°12'14.8"'S 28°E`,
      `26°12'14.8"15"S 28°E`,
      `26° 12'`,
      `°12' 14"`,
    ])("refuses %j", (text) => {
      expect(parseCoordinates(text)).toBeNull();
    });
  });

  describe("a leading word", () => {
    it.each([
      ["Coordinates -26.2041, 28.0473", JOHANNESBURG],
      ["coordinates 26.2041° S, 28.0473° E", JOHANNESBURG],
      ["Coordinates 26.20410° S, 28.04730° E", JOHANNESBURG],
      ["coords -26.2041, 28.0473", JOHANNESBURG],
    ])("reads %j", (text, expected) => {
      expect(parseCoordinates(text)).toEqual(expected);
    });

    it("allows the word only once and only at the start", () => {
      expect(parseCoordinates("coordinates coordinates 1 2")).toBeNull();
      expect(parseCoordinates("1 coordinates 2")).toBeNull();
      expect(parseCoordinates("1 2 coordinates")).toBeNull();
      expect(parseCoordinates("coordinates")).toBeNull();
    });
  });

  describe("what is not a coordinate pair", () => {
    it.each([
      "",
      "   ",
      "26",
      "2196",
      "-26.2041",
      "26.2041S",
      "12 Main Street",
      "Cape Town",
      "Johannesburg 2000",
      "2000 Johannesburg",
      "26 28 30",
      "12 34",
      "3 4",
      "+27 82",
      "E1 6",
      "S1 4",
      "N3 E1",
      "26,28",
      "-26, 28",
      "26S 28E",
      "90N 180E",
      "0 0",
      "26.2 28",
      "26 28.1",
      "5. 6.",
      "26.2041° 28",
      "02-123",
      "00-001",
      "12-34",
      "44-100",
      "12-14",
      "12–14",
      "12−14",
      "26.2-28.1",
      "26.2–28.1",
      "26.2041-28.0473",
      "1.5.-2.5",
      "-26.2041, 28.0473, 1500",
      "1, 2, 3, 4",
      "2196 2000",
      "91, 0",
      "-91, 0",
      "0, 181",
      "0, -181",
      "91S 0E",
      "0N 181E",
      "1,5 2,5",
      "1.2.3 4",
      "1..2 3",
      "- 26 28",
      "--26 28",
      "26 - 28",
      "26 +",
      "NaN, 5",
      "Infinity 5",
      "1e2 5",
      "0x10 5",
      "26,,28",
      "26;,28",
      ",26 28",
      "26 28,",
      "26°, S 28°E",
      "(26, 28)",
      "26 28 !",
      "26\u0000 28",
      "١٢ ٣٤",
    ])("refuses %j", (text) => {
      expect(parseCoordinates(text)).toBeNull();
    });
  });

  describe("hostile input", () => {
    it("refuses text longer than the limit", () => {
      expect(
        parseCoordinates(`1 ${"2".repeat(MAX_COORDINATE_TEXT_LENGTH)}`),
      ).toBeNull();
      expect(
        parseCoordinates("1.5 2.5".padEnd(MAX_COORDINATE_TEXT_LENGTH + 1)),
      ).toBeNull();
    });

    it("accepts text exactly at the limit", () => {
      const text = "1.5 2.5".padEnd(MAX_COORDINATE_TEXT_LENGTH);
      expect(text.length).toBe(MAX_COORDINATE_TEXT_LENGTH);
      expect(parseCoordinates(text)).toEqual({ lat: 1.5, lng: 2.5 });
    });

    it("answers a megabyte of text at once", () => {
      const started = performance.now();
      for (const unit of ["1,", `°'"`, " ", "S", "9", "-", "1°"]) {
        expect(
          parseCoordinates(unit.repeat(1_000_000 / unit.length)),
        ).toBeNull();
      }
      expect(performance.now() - started).toBeLessThan(250);
    });

    it("stays fast on the longest text the limit allows", () => {
      const started = performance.now();
      for (const unit of [
        "1,",
        `°'"`,
        " ",
        "S",
        "9",
        "-",
        "1°",
        "1 S ",
        "1.5 ",
      ]) {
        const text = unit
          .repeat(MAX_COORDINATE_TEXT_LENGTH)
          .slice(0, MAX_COORDINATE_TEXT_LENGTH);
        expect(text).toHaveLength(MAX_COORDINATE_TEXT_LENGTH);
        parseCoordinates(text);
      }
      expect(performance.now() - started).toBeLessThan(100);
    });
  });
});
