import {
  createFakeServices,
  DEFAULT_FAKE_VIEW,
  FakeMapAdapter,
  type FakeServices,
} from "@karta/core";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { vi } from "vitest";
import { MapContext, type MapContextValue } from "../../host";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui";
import { ChromeLayoutProvider, type ChromeLayoutValue } from "../layoutContext";

/**
 * A map context value for unit tests of chrome components, which read the map
 * through `useMap()` but must not start an engine. Defaults to a mounted
 * {@link FakeMapAdapter} at the fake default view.
 */
export function testMapContext(
  overrides: Partial<MapContextValue> = {},
): MapContextValue {
  return {
    adapter: new FakeMapAdapter(),
    hostElement: null,
    view: DEFAULT_FAKE_VIEW,
    minZoom: 0,
    maxZoom: 18,
    canZoomIn: true,
    canZoomOut: true,
    loading: false,
    tileError: false,
    error: null,
    retry: () => {},
    focusMap: () => {},
    onUserZoom: () => () => {},
    ...overrides,
  };
}

/** A chrome layout value for unit tests, with no-op publishers by default. */
export function testChromeLayout(
  overrides: Partial<ChromeLayoutValue> = {},
): ChromeLayoutValue {
  return {
    layout: "sheet",
    viewport: { width: 390, height: 800 },
    finePointer: true,
    panelEdge: null,
    bottomReserve: 0,
    publishSheetTop: () => {},
    publishToolbarTop: () => {},
    ...overrides,
  };
}

/** Options for {@link renderChrome}. */
export interface RenderChromeOptions {
  readonly services?: FakeServices;
  /** A map context value, or null to render without one. */
  readonly map?: MapContextValue | null;
  /** A chrome layout value, or undefined to use the hook's default. */
  readonly layout?: ChromeLayoutValue;
}

/** What {@link renderChrome} returns. */
export interface RenderChromeResult extends RenderResult {
  readonly services: FakeServices;
  /** Re-renders with a new element and, optionally, new context values. */
  readonly rerenderChrome: (
    ui: ReactElement,
    next?: Omit<RenderChromeOptions, "services">,
  ) => void;
}

function wrap(
  ui: ReactNode,
  services: FakeServices,
  map: MapContextValue | null,
  layout: ChromeLayoutValue | undefined,
): ReactElement {
  const withLayout = layout ? (
    <ChromeLayoutProvider value={layout}>{ui}</ChromeLayoutProvider>
  ) : (
    ui
  );
  const withMap = map ? (
    <MapContext.Provider value={map}>{withLayout}</MapContext.Provider>
  ) : (
    withLayout
  );
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>{withMap}</LiveRegionProvider>
    </ServicesProvider>
  );
}

/**
 * Renders a chrome component with fake services, the one live region and,
 * unless `map` is null, a map context.
 */
export function renderChrome(
  ui: ReactElement,
  options: RenderChromeOptions = {},
): RenderChromeResult {
  const services = options.services ?? createFakeServices();
  const map = options.map === undefined ? testMapContext() : options.map;
  const result = render(wrap(ui, services, map, options.layout));
  let current = { map, layout: options.layout };
  return {
    ...result,
    services,
    rerenderChrome(next, contexts = {}) {
      current = {
        map: contexts.map === undefined ? current.map : contexts.map,
        layout: contexts.layout ?? current.layout,
      };
      result.rerender(wrap(next, services, current.map, current.layout));
    },
  };
}

/** Collected `ResizeObserver` callbacks, so a test can report a resize. */
export interface ResizeObserverStub {
  /** Calls every live observer, as if each observed element had resized. */
  trigger(): void;
  /** How many observers are connected. */
  readonly active: number;
  /** Whether any connected observer is watching the element. */
  isObserved(element: Element): boolean;
}

/**
 * Replaces `ResizeObserver` with a stub that records callbacks (undo it with
 * `vi.unstubAllGlobals()`). happy-dom does no layout, so tests mock
 * `getBoundingClientRect` and then `trigger()`.
 */
export function stubResizeObserver(): ResizeObserverStub {
  const live = new Set<ResizeObserverStubInstance>();
  class ResizeObserverStubInstance {
    readonly targets = new Set<Element>();
    constructor(readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      this.targets.add(target);
      live.add(this);
    }
    unobserve(target: Element): void {
      this.targets.delete(target);
    }
    disconnect(): void {
      this.targets.clear();
      live.delete(this);
    }
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStubInstance);
  return {
    trigger() {
      for (const observer of [...live]) {
        observer.callback([], observer as unknown as ResizeObserver);
      }
    },
    get active() {
      return live.size;
    },
    isObserved(element) {
      return [...live].some((observer) => observer.targets.has(element));
    },
  };
}

/** A box for a mocked `getBoundingClientRect`. */
export interface TestBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Makes `element.getBoundingClientRect()` return a fixed box. */
export function mockRect(element: Element, box: TestBox): void {
  const rect = {
    ...box,
    x: box.left,
    y: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  };
  element.getBoundingClientRect = () => rect as DOMRect;
}
