// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChromeLayoutProvider, useChromeLayout } from "./layoutContext";

describe("useChromeLayout", () => {
  it("returns a harmless default outside a MapChrome", () => {
    const { result } = renderHook(() => useChromeLayout());
    expect(result.current.layout).toBe("sheet");
    expect(() => result.current.publishSheetTop(10)).not.toThrow();
    expect(() => result.current.publishToolbarTop(null)).not.toThrow();
  });

  it("returns the provided value", () => {
    const publishSheetTop = vi.fn();
    const value = {
      layout: "panel" as const,
      viewport: { width: 1280, height: 720 },
      finePointer: false,
      panelEdge: 412,
      publishSheetTop,
      publishToolbarTop: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChromeLayoutProvider value={value}>{children}</ChromeLayoutProvider>
    );
    const { result } = renderHook(() => useChromeLayout(), { wrapper });
    expect(result.current.layout).toBe("panel");
    expect(result.current.panelEdge).toBe(412);
    result.current.publishSheetTop(42);
    expect(publishSheetTop).toHaveBeenCalledWith(42);
  });
});
