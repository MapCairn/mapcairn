// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices, type UnitSystem } from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import { Suspense, startTransition, use, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services/ServicesProvider";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { type UseLocate, useLocate } from "./useLocate";

const NEVER = new Promise<never>(() => {});

describe("useLocate when a render is not committed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("words the fix in the units that are shown, not those of a render that was thrown away", async () => {
    const committed: { current: UseLocate | null } = { current: null };
    let changeUnits: (units: UnitSystem) => void = () => {};
    let abandon: () => void = () => {};
    let rerender: () => void = () => {};

    function Harness() {
      const [units, setUnits] = useState<UnitSystem>("metric");
      const [abandoned, setAbandoned] = useState(false);
      const [, setTick] = useState(0);
      changeUnits = setUnits;
      rerender = () => setTick((tick) => tick + 1);
      abandon = () => setAbandoned(true);
      const located = useLocate(units);
      useEffect(() => {
        committed.current = located;
      });
      if (abandoned) {
        use(NEVER);
      }
      return null;
    }

    render(
      <ServicesProvider services={createFakeServices()}>
        <LiveRegionProvider>
          <Suspense fallback={null}>
            <Harness />
          </Suspense>
        </LiveRegionProvider>
      </ServicesProvider>,
    );
    await act(async () => {
      startTransition(() => {
        changeUnits("imperial");
        abandon();
      });
    });
    await act(async () => rerender());
    await act(async () => committed.current?.locate());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("live-region-polite").textContent).toBe(
      "Location found, accuracy about 25 metres",
    );
  });
});
