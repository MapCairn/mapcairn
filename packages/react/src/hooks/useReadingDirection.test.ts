// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useReadingDirection } from "./useReadingDirection";

afterEach(() => {
  document.documentElement.removeAttribute("dir");
});

describe("useReadingDirection", () => {
  it("is left to right when the page sets no direction", () => {
    const { result } = renderHook(() => useReadingDirection());

    expect(result.current).toBe("ltr");
  });

  it("is right to left when the page sets dir to rtl", () => {
    document.documentElement.setAttribute("dir", "rtl");
    const { result } = renderHook(() => useReadingDirection());

    expect(result.current).toBe("rtl");
  });

  it("follows a change of direction on the page", async () => {
    const { result } = renderHook(() => useReadingDirection());

    await act(async () => {
      document.documentElement.setAttribute("dir", "rtl");
      await Promise.resolve();
    });
    expect(result.current).toBe("rtl");

    await act(async () => {
      document.documentElement.setAttribute("dir", "ltr");
      await Promise.resolve();
    });
    expect(result.current).toBe("ltr");
  });
});
