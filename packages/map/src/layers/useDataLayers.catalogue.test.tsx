// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createRuntimeLayerCatalogue,
  createStaticLayerCatalogue,
  type LayerCatalogue,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
} from "@mapcairn/core";
import { act, render, renderHook, screen } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { LayersSection } from "./LayersSection";
import { useDataLayers } from "./useDataLayers";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

/** A runtime catalogue whose one load a test settles. */
function runtimeCatalogue() {
  let settle: (payload: unknown) => void = () => undefined;
  const load = vi.fn(
    () =>
      new Promise<unknown>((resolve) => {
        settle = resolve;
      }),
  );
  return {
    load,
    catalogue: createRuntimeLayerCatalogue({ load, options }),
    resolve: (payload: unknown) => settle(payload),
  };
}

/** The section the sheet shows, driven by the hook, as the app wires them. */
function Layers() {
  const layers = useDataLayers();
  return <LayersSection layers={layers} />;
}

const treeFor = (catalogue: LayerCatalogue) => (
  <ServicesProvider services={createFakeServices({ layers: catalogue })}>
    <LiveRegionProvider>
      <Layers />
    </LiveRegionProvider>
  </ServicesProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDataLayers with a catalogue that loads", () => {
  it("offers no layers while the catalogue is loading, then the layers once it is ready", async () => {
    const { catalogue, resolve } = runtimeCatalogue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={createFakeServices({ layers: catalogue })}>
        {children}
      </ServicesProvider>
    );
    const { result } = renderHook(() => useDataLayers(), { wrapper });
    expect(result.current.layers).toEqual([]);
    await act(async () => resolve(SAMPLE_LAYERS));
    expect(result.current.layers.map((item) => item.definition.id)).toEqual(
      SAMPLE_LAYERS.map((layer) => layer.id),
    );
  });

  it("makes one request under StrictMode, which subscribes, unsubscribes and subscribes again", async () => {
    const { catalogue, load } = runtimeCatalogue();
    await act(async () => {
      render(<StrictMode>{treeFor(catalogue)}</StrictMode>);
    });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("server rendering a catalogue", () => {
  it("renders the layers of a static catalogue", () => {
    const html = renderToString(
      treeFor(createStaticLayerCatalogue(SAMPLE_LAYERS, options)),
    );
    expect(html).toContain(SAMPLE_FEED_LAYER.name);
  });

  it("renders a runtime catalogue as loading, with no section and no request", () => {
    const { catalogue, load } = runtimeCatalogue();
    expect(catalogue.getState()).toEqual({ status: "loading" });
    const html = renderToString(treeFor(catalogue));
    expect(html).not.toContain(SAMPLE_FEED_LAYER.name);
    expect(html).not.toContain("<section");
    expect(load).not.toHaveBeenCalled();
  });

  async function hydrate(server: LayerCatalogue, client: LayerCatalogue) {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    const container = document.createElement("div");
    container.innerHTML = renderToString(treeFor(server));
    document.body.append(container);
    await act(async () => {
      hydrateRoot(container, treeFor(client), {
        onRecoverableError: recoverable,
      });
    });
    return { container, errors, recoverable };
  }

  it("hydrates the layers of a static catalogue without a mismatch", async () => {
    const { container, errors, recoverable } = await hydrate(
      createStaticLayerCatalogue(SAMPLE_LAYERS, options),
      createStaticLayerCatalogue(SAMPLE_LAYERS, options),
    );
    expect(container.textContent).toContain(SAMPLE_FEED_LAYER.name);
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });

  it("hydrates a runtime catalogue as loading without a mismatch, then shows its layers", async () => {
    const client = runtimeCatalogue();
    const { container, errors, recoverable } = await hydrate(
      runtimeCatalogue().catalogue,
      client.catalogue,
    );
    expect(container.textContent).not.toContain(SAMPLE_FEED_LAYER.name);
    await act(async () => client.resolve(SAMPLE_LAYERS));
    expect(container.textContent).toContain(SAMPLE_FEED_LAYER.name);
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    container.remove();
  });

  it("shows the section once a runtime catalogue is ready, on the client", async () => {
    const { catalogue, resolve } = runtimeCatalogue();
    await act(async () => {
      render(treeFor(catalogue));
    });
    expect(screen.queryByRole("region", { name: "Layers" })).toBeNull();
    await act(async () => resolve(SAMPLE_LAYERS));
    expect(screen.getByRole("region", { name: "Layers" })).toBeInTheDocument();
  });
});
