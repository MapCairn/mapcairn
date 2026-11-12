// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { SAMPLE_TIME_LAYER } from "../fakes/layerFixtures";
import {
  defaultControlValues,
  resolveControlValues,
  templateValues,
} from "./controls";
import {
  dateTimeRange,
  describeSlot,
  describeSlotStart,
  isSlotValue,
  slotInstant,
  slotsOnDay,
  slotTime,
  slotValue,
} from "./dateTime";
import type { DateTimeControlDefinition } from "./definition";

/** 2026-11-11 20:14 UTC: the newest slot six hours back is 14:00. */
const NOW = Date.UTC(2026, 10, 11, 20, 14);
const control = SAMPLE_TIME_LAYER.controls[0] as DateTimeControlDefinition;

describe("slot values", () => {
  it("reads a real day and time as YYYY-MM-DDtHHMM", () => {
    expect(isSlotValue("2026-11-11t1430")).toBe(true);
    expect(isSlotValue("2024-02-29t0000")).toBe(true);
    expect(isSlotValue("2026-11-11t2359")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const value of [
      "2026-11-11",
      "2026-11-11T1430",
      "2026-11-11t14:30",
      "2026-11-11t2400",
      "2026-11-11t1460",
      "2025-02-29t0000",
      "2026-1-1t0000",
      "",
      42,
      null,
    ]) {
      expect(isSlotValue(value), String(value)).toBe(false);
    }
  });

  it("turns a slot into a time and back", () => {
    expect(slotTime("2026-11-11t1430")).toBe(Date.UTC(2026, 10, 11, 14, 30));
    expect(slotValue(Date.UTC(2026, 10, 11, 14, 30))).toBe("2026-11-11t1430");
    expect(slotValue(Date.UTC(2000, 5, 1, 0, 0))).toBe("2000-06-01t0000");
  });

  it("gives the ISO instant a provider names a slot by", () => {
    expect(slotInstant("2026-11-11t1430")).toBe("2026-11-11T14:30:00Z");
  });
});

describe("dateTimeRange", () => {
  it("rounds a relative bound down to the step", () => {
    expect(dateTimeRange(control, NOW)).toEqual({
      min: "2000-06-01t0000",
      max: "2026-11-11t1400",
    });
  });

  it("moves the newest slot on as time passes", () => {
    expect(dateTimeRange(control, Date.UTC(2026, 10, 11, 20, 30)).max).toBe(
      "2026-11-11t1430",
    );
    expect(dateTimeRange(control, Date.UTC(2026, 10, 12, 3, 0)).max).toBe(
      "2026-11-11t2100",
    );
  });

  it("can count both bounds back from now", () => {
    const recent: DateTimeControlDefinition = {
      ...control,
      min: { minutesAgo: 2880 },
    };
    expect(dateTimeRange(recent, NOW).min).toBe("2026-11-09t2000");
  });
});

describe("resolveControlValues with a date and time", () => {
  const time = (value: string) =>
    resolveControlValues(SAMPLE_TIME_LAYER, { time: value }, NOW).time;

  it("defaults to the newest slot", () => {
    expect(defaultControlValues(SAMPLE_TIME_LAYER, NOW)).toEqual({
      time: "2026-11-11t1400",
      opacity: "0.8",
    });
  });

  it("keeps a slot inside the bounds", () => {
    expect(time("2026-06-15t0930")).toBe("2026-06-15t0930");
  });

  it("rounds a time between steps down to its slot", () => {
    expect(time("2026-06-15t0945")).toBe("2026-06-15t0930");
  });

  it("clamps a slot the provider does not have yet, or no longer has", () => {
    expect(time("2026-11-11t1900")).toBe("2026-11-11t1400");
    expect(time("2030-01-01t0000")).toBe("2026-11-11t1400");
    expect(time("1999-12-31t2330")).toBe("2000-06-01t0000");
  });

  it("keeps a relative default inside fixed bounds", () => {
    const old: DateTimeControlDefinition = {
      ...control,
      max: "2020-01-01t1200",
    };
    const layer = { ...SAMPLE_TIME_LAYER, controls: [old] };
    expect(defaultControlValues(layer, NOW).time).toBe("2020-01-01t1200");
    expect(resolveControlValues(layer, { time: "noon" }, NOW).time).toBe(
      "2020-01-01t1200",
    );
  });

  it("replaces an unreadable value with the default", () => {
    for (const value of ["2026-11-11", "noon", "2026-02-30t1200"]) {
      expect(time(value)).toBe("2026-11-11t1400");
    }
  });
});

describe("templateValues with a date and time", () => {
  it("fills the template with the ISO instant", () => {
    expect(
      templateValues(SAMPLE_TIME_LAYER, {
        time: "2026-11-11t1430",
        opacity: "0.8",
      }),
    ).toEqual({ time: "2026-11-11T14:30:00Z", opacity: "0.8" });
  });
});

describe("slotsOnDay", () => {
  it("lists every slot of a whole day", () => {
    const slots = slotsOnDay(control, "2026-06-15", NOW);
    expect(slots).toHaveLength(48);
    expect(slots[0]).toEqual({ value: "2026-06-15t0000", label: "00:00" });
    expect(slots[47]).toEqual({ value: "2026-06-15t2330", label: "23:30" });
  });

  it("stops at the newest slot on the newest day", () => {
    const slots = slotsOnDay(control, "2026-11-11", NOW);
    expect(slots).toHaveLength(29);
    expect(slots.at(-1)).toEqual({ value: "2026-11-11t1400", label: "14:00" });
  });

  it("starts at the first slot on the first day", () => {
    const late: DateTimeControlDefinition = {
      ...control,
      min: "2000-06-01t1800",
    };
    const slots = slotsOnDay(late, "2000-06-01", NOW);
    expect(slots[0]?.label).toBe("18:00");
    expect(slots).toHaveLength(12);
  });

  it("lists nothing for a day outside the bounds or not a day", () => {
    expect(slotsOnDay(control, "2026-11-12", NOW)).toEqual([]);
    expect(slotsOnDay(control, "1999-01-01", NOW)).toEqual([]);
    expect(slotsOnDay(control, "soon", NOW)).toEqual([]);
  });

  it("uses the control's step", () => {
    const hourly: DateTimeControlDefinition = { ...control, stepMinutes: 60 };
    expect(slotsOnDay(hourly, "2026-06-15", NOW)).toHaveLength(24);
  });
});

describe("describeSlot", () => {
  it("names the half hour shown, with its time zone", () => {
    expect(describeSlot("2026-11-11t1430", 30)).toBe(
      "14:30 to 15:00 UTC on 11 November 2026",
    );
  });

  it("names when a slot starts", () => {
    expect(describeSlotStart("2026-11-11t1430")).toBe(
      "14:30 UTC on 11 November 2026",
    );
  });

  it("ends a slot at midnight with the next day's time", () => {
    expect(describeSlot("2026-12-31t2330", 30)).toBe(
      "23:30 to 00:00 UTC on 31 December 2026",
    );
  });
});
