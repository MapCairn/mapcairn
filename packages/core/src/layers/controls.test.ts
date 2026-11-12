import { describe, expect, it } from "vitest";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_TIME_LAYER,
} from "../fakes/layerFixtures";
import {
  defaultControlValues,
  describeChosenTime,
  isControlEnabled,
  resolveControlValues,
  resolveDateBound,
  templateValues,
} from "./controls";

const NOW = Date.UTC(2026, 10, 9, 8, 30);

describe("resolveDateBound", () => {
  it("passes an ISO date through", () => {
    expect(resolveDateBound("2024-02-29", NOW)).toBe("2024-02-29");
  });

  it("counts days back from today in UTC", () => {
    expect(resolveDateBound({ daysAgo: 0 }, NOW)).toBe("2026-11-09");
    expect(resolveDateBound({ daysAgo: 1 }, NOW)).toBe("2026-11-08");
    expect(resolveDateBound({ daysAgo: 10 }, NOW)).toBe("2026-10-30");
  });
});

describe("defaultControlValues", () => {
  it("gives every control its default as a string", () => {
    expect(defaultControlValues(SAMPLE_FEED_LAYER, NOW)).toEqual({
      window: "day",
      small: "false",
    });
    expect(defaultControlValues(SAMPLE_TILE_LAYER, NOW)).toEqual({
      date: "2026-11-08",
      opacity: "0.8",
    });
  });

  it("is empty for a layer with no controls", () => {
    expect(defaultControlValues(SAMPLE_ALERT_LAYER, NOW)).toEqual({});
  });
});

describe("resolveControlValues", () => {
  it("keeps valid values and fills the rest with defaults", () => {
    expect(
      resolveControlValues(SAMPLE_FEED_LAYER, { window: "hour" }, NOW),
    ).toEqual({ window: "hour", small: "false" });
  });

  it("replaces a value a control does not offer with its default", () => {
    expect(
      resolveControlValues(
        SAMPLE_FEED_LAYER,
        { window: "month", small: "yes" },
        NOW,
      ),
    ).toEqual({ window: "day", small: "false" });
  });

  it("drops values for controls the layer does not have", () => {
    expect(
      resolveControlValues(SAMPLE_FEED_LAYER, { other: "x" }, NOW),
    ).toEqual({ window: "day", small: "false" });
  });

  it("accepts a date inside the bounds and clamps one outside them", () => {
    expect(
      resolveControlValues(SAMPLE_TILE_LAYER, { date: "2025-01-01" }, NOW).date,
    ).toBe("2025-01-01");
    expect(
      resolveControlValues(SAMPLE_TILE_LAYER, { date: "2020-01-01" }, NOW).date,
    ).toBe("2024-02-29");
    expect(
      resolveControlValues(SAMPLE_TILE_LAYER, { date: "2026-11-09" }, NOW).date,
    ).toBe("2026-11-08");
  });

  it("replaces a date that is not a real calendar day with the default", () => {
    for (const date of ["2025-02-30", "yesterday", "2025-1-1"]) {
      expect(resolveControlValues(SAMPLE_TILE_LAYER, { date }, NOW).date).toBe(
        "2026-11-08",
      );
    }
  });

  it("accepts a range value between its bounds and replaces anything else", () => {
    const radius = (value: string) =>
      resolveControlValues(SAMPLE_HEATMAP_LAYER, { radius: value }, NOW).radius;
    expect(radius("40")).toBe("40");
    expect(radius("4")).toBe("4");
    expect(radius("80")).toBe("80");
    expect(radius("3")).toBe("20");
    expect(radius("81")).toBe("20");
    expect(radius("wide")).toBe("20");
    expect(radius("")).toBe("20");
    expect(defaultControlValues(SAMPLE_HEATMAP_LAYER, NOW)).toEqual({
      radius: "20",
      intensity: "1",
      opacity: "0.8",
    });
  });

  it("accepts an opacity from 0.1 to 1 and replaces anything else", () => {
    const opacity = (value: string) =>
      resolveControlValues(SAMPLE_TILE_LAYER, { opacity: value }, NOW).opacity;
    expect(opacity("0.5")).toBe("0.5");
    expect(opacity("1")).toBe("1");
    expect(opacity("0.05")).toBe("0.8");
    expect(opacity("2")).toBe("0.8");
    expect(opacity("half")).toBe("0.8");
  });

  it("accepts true and false for a switch", () => {
    expect(
      resolveControlValues(SAMPLE_FEED_LAYER, { small: "true" }, NOW).small,
    ).toBe("true");
  });
});

describe("isControlEnabled", () => {
  const small = SAMPLE_FEED_LAYER.controls[1];

  it("is true for a control with no condition", () => {
    expect(
      isControlEnabled(SAMPLE_FEED_LAYER.controls[0], { window: "hour" }),
    ).toBe(true);
  });

  it("follows the control it depends on", () => {
    expect(isControlEnabled(small, { window: "day" })).toBe(true);
    expect(isControlEnabled(small, { window: "hour" })).toBe(false);
  });
});

describe("templateValues", () => {
  it("adds derived variables, looked up from the controls they depend on", () => {
    expect(
      templateValues(SAMPLE_FEED_LAYER, { window: "day", small: "true" }),
    ).toEqual({ window: "day", small: "true", feed: "all_day" });
    expect(
      templateValues(SAMPLE_FEED_LAYER, { window: "hour", small: "false" }),
    ).toEqual({ window: "hour", small: "false", feed: "all_hour" });
  });

  it("treats a disabled control as its default when looking up a variable", () => {
    expect(
      templateValues(SAMPLE_FEED_LAYER, { window: "hour", small: "true" }).feed,
    ).toBe("all_hour");
  });

  it("leaves out a derived variable whose combination is not in its table", () => {
    const values = templateValues(
      {
        ...SAMPLE_FEED_LAYER,
        variables: [{ id: "feed", from: ["window"], table: {} }],
      },
      { window: "day", small: "false" },
    );
    expect(values).not.toHaveProperty("feed");
  });
});

describe("describeChosenTime", () => {
  it("names the day a date control is set to", () => {
    expect(describeChosenTime(SAMPLE_TILE_LAYER, { date: "2026-11-08" })).toBe(
      "8 November 2026",
    );
  });

  it("names the UTC time and day a date and time control is set to", () => {
    expect(
      describeChosenTime(SAMPLE_TIME_LAYER, { time: "2026-11-11t1300" }),
    ).toBe("13:00 UTC on 11 November 2026");
  });

  it("is null for a layer with no date or time to choose", () => {
    expect(describeChosenTime(SAMPLE_FEED_LAYER, { window: "day" })).toBeNull();
  });

  it("is null when the control's value is not a date or a slot", () => {
    expect(describeChosenTime(SAMPLE_TILE_LAYER, { date: "soon" })).toBeNull();
    expect(describeChosenTime(SAMPLE_TIME_LAYER, {})).toBeNull();
  });
});
