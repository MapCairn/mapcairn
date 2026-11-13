// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { fixedDecimal, withFixedDecimals } from "./fixedDecimal";

describe("fixedDecimal", () => {
  it("writes small numbers without an exponent", () => {
    expect(fixedDecimal(7.8e-7)).toBe("0.00000078");
    expect(fixedDecimal(-7.8e-7)).toBe("-0.00000078");
    expect(fixedDecimal(1e-7)).toBe("0.0000001");
    expect(fixedDecimal(1.234567e-9)).toBe("0.000000001234567");
    expect(fixedDecimal(5e-324)).toBe(`0.${"0".repeat(323)}5`);
  });

  it("writes large numbers without an exponent", () => {
    expect(fixedDecimal(1e21)).toBe(`1${"0".repeat(21)}`);
    expect(fixedDecimal(-1.5e22)).toBe(`-15${"0".repeat(21)}`);
    expect(fixedDecimal(1.2345678901234566e25)).toBe(
      `12345678901234566${"0".repeat(9)}`,
    );
  });

  it("leaves a number that String writes without an exponent as it is", () => {
    for (const value of [
      0, -0, 1, -1, 0.5, 36.8219, -1.2921, 1e-6, 123456789,
    ]) {
      expect(fixedDecimal(value)).toBe(String(value));
    }
  });

  it("writes -0 as 0, as String does", () => {
    expect(fixedDecimal(-0)).toBe("0");
  });

  it("never writes an exponent, reads back as the same number and changes nothing else", () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        (value) => {
          const text = fixedDecimal(value);
          expect(text).not.toMatch(/e/i);
          // `===` and not `toBe`: the text "0" reads back as +0 for a -0.
          expect(Number(text) === value).toBe(true);
          if (!String(value).includes("e")) {
            expect(text).toBe(String(value));
          }
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("withFixedDecimals", () => {
  it("rewrites the numbers JSON.stringify writes with an exponent", () => {
    const json = JSON.stringify({ a: [7.8e-7, -1e-9, 1e21], b: 0.5 });
    expect(json).toContain("e");
    expect(withFixedDecimals(json)).toBe(
      `{"a":[0.00000078,-0.000000001,${"1".padEnd(22, "0")}],"b":0.5}`,
    );
  });

  it("leaves text inside strings alone", () => {
    const json = JSON.stringify({ name: 'a "1e-7" \\ 2e5', value: 1e-7 });
    expect(withFixedDecimals(json)).toBe(
      `{"name":"a \\"1e-7\\" \\\\ 2e5","value":0.0000001}`,
    );
  });

  it("leaves literals, an unfinished string and a lone minus as they are", () => {
    expect(withFixedDecimals('[true,false,null,"a\\"b",-1e-7]')).toBe(
      '[true,false,null,"a\\"b",-0.0000001]',
    );
    expect(withFixedDecimals('{"a":1e-7,"b":"1e-7')).toBe(
      '{"a":0.0000001,"b":"1e-7',
    );
    expect(withFixedDecimals("-")).toBe("-");
    expect(withFixedDecimals("[1e999,-e]")).toBe("[1e999,-e]");
    expect(withFixedDecimals('"ends in a backslash\\')).toBe(
      '"ends in a backslash\\',
    );
  });

  it("takes time in proportion to the text, however many quotes and zeros it holds", () => {
    const quotes = `"${'\\"'.repeat(20_000)}`;
    const zeros = `[${"0".repeat(40_000)}`;
    const started = performance.now();
    expect(withFixedDecimals(quotes)).toBe(quotes);
    expect(withFixedDecimals(zeros)).toBe(zeros);
    expect(performance.now() - started).toBeLessThan(1000);
  }, 20_000);

  it("returns JSON without an exponent unchanged, indentation included", () => {
    const json = JSON.stringify({ a: [1, 2.5], b: { c: "x" } }, null, 2);
    expect(withFixedDecimals(json)).toBe(json);
  });

  it("keeps any value it was given, strings included, and leaves no exponent in its numbers", () => {
    fc.assert(
      fc.property(
        fc.record({
          numbers: fc.array(
            fc.double({ noNaN: true, noDefaultInfinity: true }),
          ),
          text: fc.string(),
        }),
        (value) => {
          const json = JSON.stringify(value);
          expect(JSON.parse(withFixedDecimals(json))).toEqual(JSON.parse(json));
          expect(withFixedDecimals(JSON.stringify(value.numbers))).not.toMatch(
            /e/i,
          );
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });
});
