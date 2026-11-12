// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  FocusRegistryProvider,
  useFocusReturn,
  useFocusTarget,
} from "./focusRegistry";

function Harness({
  focusMap,
  show = true,
}: {
  focusMap: () => void;
  show?: boolean;
}) {
  return (
    <FocusRegistryProvider focusMap={focusMap}>
      {show ? <Opener /> : null}
      <Restorer />
    </FocusRegistryProvider>
  );
}

function Opener() {
  const ref = useFocusTarget("map-options");
  return (
    <button type="button" ref={ref}>
      Map options
    </button>
  );
}

function Restorer() {
  const restore = useFocusReturn();
  const [name] = useState<"map-options" | "search" | null>("map-options");
  return (
    <>
      <button type="button" onClick={() => restore(name)}>
        restore
      </button>
      <button type="button" onClick={() => restore(null)}>
        restore-null
      </button>
      <button type="button" onClick={() => restore("search")}>
        restore-missing
      </button>
    </>
  );
}

describe("focus registry", () => {
  it("focuses the registered control", () => {
    const focusMap = vi.fn();
    const { getByText } = render(<Harness focusMap={focusMap} />);
    getByText("restore").click();
    expect(document.activeElement).toBe(getByText("Map options"));
    expect(focusMap).not.toHaveBeenCalled();
  });

  it("falls back to the map for a null name or a name nobody registered", () => {
    const focusMap = vi.fn();
    const { getByText } = render(<Harness focusMap={focusMap} />);
    getByText("restore-null").click();
    getByText("restore-missing").click();
    expect(focusMap).toHaveBeenCalledTimes(2);
  });

  it("falls back to the map once the control has been removed", () => {
    const focusMap = vi.fn();
    const { getByText, rerender } = render(<Harness focusMap={focusMap} />);
    rerender(<Harness focusMap={focusMap} show={false} />);
    getByText("restore").click();
    expect(focusMap).toHaveBeenCalledOnce();
  });

  it("uses the latest focusMap callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByText, rerender } = render(<Harness focusMap={first} />);
    rerender(<Harness focusMap={second} />);
    getByText("restore-null").click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("throws a clear error outside a provider", () => {
    const error = console.error;
    console.error = () => {};
    expect(() => renderHook(() => useFocusReturn())).toThrow(
      "Focus registry hooks must be used inside a FocusRegistryProvider.",
    );
    console.error = error;
  });
});
