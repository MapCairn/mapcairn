// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act } from "@testing-library/react";
import { Suspense, startTransition, use, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChromeLayoutProvider } from "../layoutContext";
import { ChromeSurfaceContext } from "../MapChrome/chromeSurface";
import { renderChrome, testChromeLayout } from "../MapChrome/chromeTestHarness";
import { Sheet } from "./Sheet";

const NEVER = new Promise<never>(() => {});

describe("Sheet when a render is not committed", () => {
  it("clears the sheet edge through the publisher that was committed, not one from a render that was thrown away", async () => {
    const committed = vi.fn();
    const discarded = vi.fn();
    let propose: (next: (top: number | null) => void) => void = () => {};
    let abandon: () => void = () => {};

    function Suspender({ suspended }: { suspended: boolean }) {
      if (suspended) {
        use(NEVER);
      }
      return null;
    }
    function Harness() {
      const [publishSheetTop, setPublishSheetTop] = useState<
        (top: number | null) => void
      >(() => committed);
      const [abandoned, setAbandoned] = useState(false);
      propose = (next) => setPublishSheetTop(() => next);
      abandon = () => setAbandoned(true);
      return (
        <>
          <ChromeLayoutProvider value={testChromeLayout({ publishSheetTop })}>
            <ChromeSurfaceContext.Provider
              value={{
                publishSheetDetent: vi.fn(),
                publishPanelEdge: vi.fn(),
                endStackMaxHeight: null,
                tourHidden: false,
              }}
            >
              <Sheet
                id="map-options-sheet"
                open
                title="Map options"
                onClose={vi.fn()}
                detent="half"
                onDetentChange={vi.fn()}
              >
                <button type="button">Option</button>
              </Sheet>
            </ChromeSurfaceContext.Provider>
          </ChromeLayoutProvider>
          <Suspender suspended={abandoned} />
        </>
      );
    }

    const view = renderChrome(
      <Suspense fallback={null}>
        <Harness />
      </Suspense>,
      { map: null },
    );
    await act(async () => {
      startTransition(() => {
        propose(discarded);
        abandon();
      });
    });
    view.unmount();

    expect(discarded).not.toHaveBeenCalled();
    expect(committed).toHaveBeenLastCalledWith(null);
  });
});
