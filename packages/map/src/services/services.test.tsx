import { createFakeServices, MemorySettingsStore } from "@karta/core";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  useClipboard,
  useLayers,
  useLocationProvider,
  useMapAdapterFactory,
  usePreferences,
  useRoutingProvider,
  useSaveData,
  useSearchProvider,
  useSettings,
  useTheme,
  useThemeSource,
  useUrlState,
} from "./hooks";
import { ServicesProvider, useServices } from "./ServicesProvider";

function wrapperFor(services = createFakeServices()) {
  return {
    services,
    wrapper: ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>{children}</ServicesProvider>
    ),
  };
}

describe("ServicesProvider", () => {
  it("throws a clear error when a hook runs outside the provider", () => {
    const error = console.error;
    console.error = () => {};
    expect(() => renderHook(() => useServices())).toThrow(
      "useServices must be used inside a ServicesProvider.",
    );
    console.error = error;
  });

  it("renders its children", () => {
    render(
      <ServicesProvider services={createFakeServices()}>
        <p>inside</p>
      </ServicesProvider>,
    );
    expect(screen.getByText("inside")).toBeTruthy();
  });

  it("exposes each service through its own hook", () => {
    const { services, wrapper } = wrapperFor();
    expect(
      renderHook(() => useMapAdapterFactory(), { wrapper }).result.current,
    ).toBe(services.createMapAdapter);
    expect(
      renderHook(() => useSearchProvider(), { wrapper }).result.current,
    ).toBe(services.search);
    expect(
      renderHook(() => useLocationProvider(), { wrapper }).result.current,
    ).toBe(services.location);
    expect(renderHook(() => useClipboard(), { wrapper }).result.current).toBe(
      services.clipboard,
    );
    expect(renderHook(() => useUrlState(), { wrapper }).result.current).toBe(
      services.url,
    );
    expect(renderHook(() => useThemeSource(), { wrapper }).result.current).toBe(
      services.theme,
    );
    expect(renderHook(() => useLayers(), { wrapper }).result.current).toBe(
      services.layers,
    );
    expect(
      renderHook(() => useRoutingProvider(), { wrapper }).result.current,
    ).toBe(services.routing);
  });

  it("gives no routing provider when the host supplies none", () => {
    const { wrapper } = wrapperFor(createFakeServices({ routing: undefined }));
    expect(
      renderHook(() => useRoutingProvider(), { wrapper }).result.current,
    ).toBeUndefined();
  });
});

describe("useSettings", () => {
  it("re-renders when a setting changes and reports persistence", () => {
    const { wrapper } = wrapperFor();
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings.units).toBe("metric");
    expect(result.current.persistent).toBe(true);
    act(() => {
      result.current.update({ units: "imperial" });
    });
    expect(result.current.settings.units).toBe("imperial");
  });

  it("reports blocked storage so the ui can say changes are not remembered", () => {
    const blocked = createFakeServices({
      settings: new MemorySettingsStore({ persistent: false }),
    });
    const { wrapper } = wrapperFor(blocked);
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.persistent).toBe(false);
  });
});

describe("usePreferences", () => {
  it("reports preferences and follows live changes", () => {
    const { services, wrapper } = wrapperFor();
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.reducedMotion).toBe(false);
    act(() => {
      services.fakes.preferences.set({ reducedMotion: true });
    });
    expect(result.current.reducedMotion).toBe(true);
  });
});

describe("useSaveData", () => {
  it("follows the device when the person has not chosen", () => {
    const { services, wrapper } = wrapperFor();
    const { result } = renderHook(() => useSaveData(), { wrapper });
    expect(result.current).toBe(false);
    act(() => {
      services.fakes.preferences.set({ saveData: true });
    });
    expect(result.current).toBe(true);
  });

  it("lets an explicit choice win over the device in both directions", () => {
    const { services, wrapper } = wrapperFor();
    const { result } = renderHook(() => useSaveData(), { wrapper });
    act(() => {
      services.fakes.preferences.set({ saveData: true });
      services.fakes.settings.set({ saveData: false });
    });
    expect(result.current).toBe(false);
    act(() => {
      services.fakes.preferences.set({ saveData: false });
      services.fakes.settings.set({ saveData: true });
    });
    expect(result.current).toBe(true);
    act(() => {
      services.fakes.settings.set({ saveData: null });
    });
    expect(result.current).toBe(false);
  });
});

describe("useTheme", () => {
  it("resolves the system theme and applies it to the document", () => {
    const { services, wrapper } = wrapperFor();
    services.fakes.theme.setSystemTheme("dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.choice).toBe("system");
    expect(result.current.resolved).toBe("dark");
    expect(services.fakes.theme.appliedTheme).toBe("dark");
  });

  it("follows live system changes only while the choice is system", () => {
    const { services, wrapper } = wrapperFor();
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      services.fakes.theme.setSystemTheme("dark");
    });
    expect(result.current.resolved).toBe("dark");
    act(() => {
      result.current.setChoice("light");
    });
    expect(result.current.resolved).toBe("light");
    act(() => {
      services.fakes.theme.setSystemTheme("light");
      services.fakes.theme.setSystemTheme("dark");
    });
    expect(result.current.resolved).toBe("light");
    expect(services.fakes.theme.appliedTheme).toBe("light");
  });
});
