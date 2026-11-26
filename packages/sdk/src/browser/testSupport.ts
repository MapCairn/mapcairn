// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeMapAdapterFactory,
  type FakeMapAdapter,
  type MapAdapterFactory,
} from "@mapcairn/core";
import { expect, vi } from "vitest";
import { type MountDependencies, mount } from "./mount";
import type { MapHandle, MountMapOptions } from "./types";

/** What a test gets from {@link harness}: the dependencies and what they made. */
export interface Harness {
  readonly dependencies: MountDependencies;
  readonly adapters: FakeMapAdapter[];
  readonly workerUrls: string[];
}

/** Dependencies for `mount` that draw with the fake engine and record what they make. */
export function harness(
  factory?: (onCreate: (adapter: FakeMapAdapter) => void) => MapAdapterFactory,
): Harness {
  const adapters: FakeMapAdapter[] = [];
  const workerUrls: string[] = [];
  const onCreate = (adapter: FakeMapAdapter) => {
    vi.spyOn(adapter, "mount");
    vi.spyOn(adapter, "setBasemap");
    adapters.push(adapter);
  };
  return {
    adapters,
    workerUrls,
    dependencies: {
      createMapAdapter: (workerUrl) => {
        workerUrls.push(workerUrl ?? "");
        return (factory ?? createFakeMapAdapterFactory)(onCreate);
      },
    },
  };
}

/** An element with a height, as happy-dom lays out none. */
export function container(height = 300): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({
      height,
      width: 400,
      top: 0,
      left: 0,
      right: 400,
      bottom: height,
    }) as DOMRect;
  document.body.append(element);
  return element;
}

const mounted: MapHandle[] = [];

/** Mounts a map and remembers it, so {@link destroyMounted} removes it. */
export function mountOn(
  element: HTMLElement,
  tools: Harness,
  options: MountMapOptions = {},
): MapHandle {
  const handle = mount(element, options, tools.dependencies);
  mounted.push(handle);
  return handle;
}

/** Remembers a handle made some other way. */
export function remember(handle: MapHandle): MapHandle {
  mounted.push(handle);
  return handle;
}

/** Destroys every remembered map and empties the page. */
export function destroyMounted(): void {
  for (const handle of mounted.splice(0)) {
    handle.destroy();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
}

/** Resolves when the engine is drawing. */
export async function drawn(handle: MapHandle): Promise<void> {
  await handle.ready;
}

/** The button with an accessible name, once the interface has drawn it. */
export function button(
  element: HTMLElement,
  name: string,
): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const found = element.querySelector<HTMLElement>(
      `button[aria-label="${name}"]`,
    );
    expect(found, name).not.toBeNull();
    return found as HTMLElement;
  });
}
