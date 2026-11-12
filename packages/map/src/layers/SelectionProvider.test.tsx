// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectionProvider, useSelection } from "./SelectionProvider";
import type { FeatureSelectionState } from "./useFeatureSelection";

const state: FeatureSelectionState = {
  entries: [],
  limit: 200,
  selecting: false,
  setSelecting: vi.fn(),
  toggle: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
};

describe("useSelection", () => {
  it("is undefined outside a provider, and does not throw", () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current).toBeUndefined();
  });

  it("returns what the provider was given", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SelectionProvider selection={state}>{children}</SelectionProvider>
    );
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current).toBe(state);
  });

  it("gives the same value to a consumer on every render while the selection is the same", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SelectionProvider selection={state}>{children}</SelectionProvider>
    );
    const { result, rerender } = renderHook(() => useSelection(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("is undefined under a provider that has no selection, so a host with no store needs no branch", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SelectionProvider selection={null}>{children}</SelectionProvider>
    );
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it("lets an inner provider without a selection hide an outer one", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SelectionProvider selection={state}>
        <SelectionProvider selection={null}>{children}</SelectionProvider>
      </SelectionProvider>
    );
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current).toBeUndefined();
  });
});
