import {
  LONG_PRESS_DELAY_MS,
  SCALE_BAR_IDLE_MS,
  VIEW_SETTLE_MS,
} from "@mapcairn/map";
import { describe, expect, it } from "vitest";
import * as e2eTimers from "../e2e/support/timers";

describe("the browser tests' copies of the app's timers", () => {
  // The specs jump the page clock by these copies, because a spec cannot
  // import @mapcairn/map. A copy shorter than the app's timer would let an
  // absence check pass before the timer fired.
  it("match the constants in @mapcairn/map", () => {
    expect({
      LONG_PRESS_DELAY_MS: e2eTimers.LONG_PRESS_DELAY_MS,
      VIEW_SETTLE_MS: e2eTimers.VIEW_SETTLE_MS,
      SCALE_BAR_IDLE_MS: e2eTimers.SCALE_BAR_IDLE_MS,
    }).toEqual({ LONG_PRESS_DELAY_MS, VIEW_SETTLE_MS, SCALE_BAR_IDLE_MS });
  });
});
