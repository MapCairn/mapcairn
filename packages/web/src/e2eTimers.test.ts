// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { TILE_LAYER_SLOW_MS } from "@mapcairn/adapter-maplibre";
import {
  IDENTIFY_FEEDBACK_MS,
  LONG_PRESS_DELAY_MS,
  SCALE_BAR_IDLE_MS,
  SUGGEST_DEBOUNCE_MS,
  VIEW_SETTLE_MS,
} from "@mapcairn/map";
import { describe, expect, it } from "vitest";
import * as e2eTimers from "../e2e/support/timers";
import { CONNECTION_SETTLE_MS } from "./app/useConnectionNotice";

describe("the browser tests' copies of the app's timers", () => {
  // The specs jump the page clock by these copies, because a spec cannot
  // import @mapcairn/map. A copy shorter than the app's timer would let an
  // absence check pass before the timer fired.
  it("match the constants in the app", () => {
    expect({
      CONNECTION_SETTLE_MS: e2eTimers.CONNECTION_SETTLE_MS,
      IDENTIFY_FEEDBACK_MS: e2eTimers.IDENTIFY_FEEDBACK_MS,
      LONG_PRESS_DELAY_MS: e2eTimers.LONG_PRESS_DELAY_MS,
      VIEW_SETTLE_MS: e2eTimers.VIEW_SETTLE_MS,
      SCALE_BAR_IDLE_MS: e2eTimers.SCALE_BAR_IDLE_MS,
      SUGGEST_DEBOUNCE_MS: e2eTimers.SUGGEST_DEBOUNCE_MS,
      TILE_LAYER_SLOW_MS: e2eTimers.TILE_LAYER_SLOW_MS,
    }).toEqual({
      CONNECTION_SETTLE_MS,
      IDENTIFY_FEEDBACK_MS,
      LONG_PRESS_DELAY_MS,
      VIEW_SETTLE_MS,
      SCALE_BAR_IDLE_MS,
      SUGGEST_DEBOUNCE_MS,
      TILE_LAYER_SLOW_MS,
    });
  });
});
