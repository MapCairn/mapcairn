// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { measureOptions, runOrder, summarise, summaryTable } from "./summary";

describe("runOrder", () => {
  it("interleaves the two builds and swaps which goes first each round, so drift falls on both", () => {
    expect(runOrder(3)).toEqual([
      "base",
      "change",
      "change",
      "base",
      "base",
      "change",
    ]);
  });
});

describe("summarise", () => {
  it("gives the median with the range", () => {
    expect(summarise([30, 10, 20])).toEqual({ median: 20, low: 10, high: 30 });
    expect(summarise([40, 10, 20, 30])).toEqual({
      median: 25,
      low: 10,
      high: 40,
    });
  });

  it("refuses to summarise nothing", () => {
    expect(() => summarise([])).toThrow("no samples");
  });
});

describe("summaryTable", () => {
  it("sets each measure's two builds side by side in whole milliseconds", () => {
    expect(
      summaryTable(["Open the sheet"], {
        base: [{ "Open the sheet": 100.4 }, { "Open the sheet": 120 }],
        change: [{ "Open the sheet": 130 }, { "Open the sheet": 140 }],
      }),
    ).toBe(
      [
        "| Measure        | Base (ms)         | Change (ms)       |",
        "| -------------- | ----------------- | ----------------- |",
        "| Open the sheet | 110 (100 to 120)  | 135 (130 to 140)  |",
      ].join("\n"),
    );
  });
});

describe("measureOptions", () => {
  const addresses = [
    "--base",
    "http://localhost:4893",
    "--change",
    "http://localhost:4891",
  ];

  it("reads the two addresses, with seven rounds at a quarter of the speed", () => {
    expect(measureOptions(addresses)).toEqual({
      base: "http://localhost:4893",
      change: "http://localhost:4891",
      rounds: 7,
      throttle: 4,
    });
  });

  it("slows the network only when given a rate, with no delay unless given one", () => {
    expect(measureOptions(addresses).network).toBeUndefined();
    expect(measureOptions([...addresses, "--kbps", "1600"]).network).toEqual({
      kbps: 1600,
      latencyMs: 0,
    });
    expect(
      measureOptions([...addresses, "--kbps", "1600", "--latency", "150"])
        .network,
    ).toEqual({ kbps: 1600, latencyMs: 150 });
  });

  it("takes the rounds and the throttle when given", () => {
    expect(
      measureOptions([...addresses, "--rounds", "3", "--throttle", "6"]),
    ).toMatchObject({ rounds: 3, throttle: 6 });
  });

  it.each([
    ["an address is missing", ["--base", "http://localhost:4893"]],
    ["rounds is not a count", [...addresses, "--rounds", "0"]],
    ["throttle is not a rate", [...addresses, "--throttle", "fast"]],
    ["the network rate is not one", [...addresses, "--kbps", "slow"]],
    ["a delay is given with no rate", [...addresses, "--latency", "150"]],
  ])("refuses when %s", (_case, args) => {
    expect(() => measureOptions(args)).toThrow("Usage");
  });
});
