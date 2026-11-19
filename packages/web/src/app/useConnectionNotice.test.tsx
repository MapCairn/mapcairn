// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONNECTION_SETTLE_MS,
  useConnectionNotice,
} from "./useConnectionNotice";

function setup(online = true) {
  const services = createFakeServices();
  services.fakes.preferences.set({ online });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const hook = renderHook(() => useConnectionNotice(), { wrapper });
  const preferences = services.fakes.preferences;
  return {
    hook,
    /** The browser reports a new state, and the settle delay passes. */
    go(next: boolean, ms = CONNECTION_SETTLE_MS) {
      act(() => preferences.set({ online: next }));
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
    change(next: boolean) {
      act(() => preferences.set({ online: next }));
    },
    wait(ms: number) {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useConnectionNotice", () => {
  it("says nothing while the device stays online", () => {
    const { hook, wait } = setup();
    wait(CONNECTION_SETTLE_MS * 3);
    expect(hook.result.current.notice).toBeNull();
  });

  it("says the device is offline once the signal has held for the settle delay, not before", () => {
    const { hook, change, wait } = setup();
    change(false);
    wait(CONNECTION_SETTLE_MS - 1);
    expect(hook.result.current.notice).toBeNull();
    wait(1);
    expect(hook.result.current.notice).toBe("offline");
  });

  it("says it once for a page that opens offline, after the first render", () => {
    const { hook, wait } = setup(false);
    expect(hook.result.current.notice).toBeNull();
    wait(CONNECTION_SETTLE_MS);
    expect(hook.result.current.notice).toBe("offline");
  });

  it("says the device is back, replacing the offline notice", () => {
    const { hook, go } = setup();
    go(false);
    go(true);
    expect(hook.result.current.notice).toBe("online");
  });

  it("says nothing for a connection that drops and returns within the settle delay", () => {
    const { hook, change, wait } = setup();
    change(false);
    wait(CONNECTION_SETTLE_MS - 1);
    change(true);
    wait(CONNECTION_SETTLE_MS * 2);
    expect(hook.result.current.notice).toBeNull();
  });

  it("does not say it is back after a blip it never reported as offline", () => {
    const { hook, go } = setup();
    go(false, CONNECTION_SETTLE_MS - 1);
    go(true);
    expect(hook.result.current.notice).toBeNull();
  });

  it("says each real change once when the connection keeps flipping, never twice in a row", () => {
    const { hook, go } = setup();
    const seen: (string | null)[] = [];
    for (const next of [false, true, false, true]) {
      go(next);
      seen.push(hook.result.current.notice);
    }
    expect(seen).toEqual(["offline", "online", "offline", "online"]);
  });

  it("lets the person dismiss it, and says the next change again", () => {
    const { hook, go } = setup();
    go(false);
    act(() => hook.result.current.dismiss());
    expect(hook.result.current.notice).toBeNull();
    go(true);
    expect(hook.result.current.notice).toBe("online");
  });

  it("starts nothing when unmounted mid-delay", () => {
    const { hook, change, wait } = setup();
    change(false);
    hook.unmount();
    expect(() => wait(CONNECTION_SETTLE_MS)).not.toThrow();
  });
});
