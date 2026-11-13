// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type CatalogueRefresh,
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createRuntimeLayerCatalogue,
  FakeLayerCatalogue,
  type LayerCatalogue,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { LayersSection, type LayersSectionProps } from "./LayersSection";
import { useDataLayers } from "./useDataLayers";

const DEFAULT_INTRO =
  "Open data from public providers. Nothing is requested until you turn a layer on.";

function Section(props: Partial<LayersSectionProps>) {
  const layers = useDataLayers();
  return <LayersSection layers={layers} {...props} />;
}

function show(
  catalogue: LayerCatalogue,
  props: Partial<LayersSectionProps> = {},
) {
  return render(
    <ServicesProvider services={createFakeServices({ layers: catalogue })}>
      <LiveRegionProvider>
        <Section {...props} />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
}

function loadingCatalogue() {
  const catalogue = new FakeLayerCatalogue();
  catalogue.setState({ status: "loading" });
  return catalogue;
}

function readyWith(
  catalogue: FakeLayerCatalogue,
  options: { skipped?: number; refresh?: CatalogueRefresh } = {},
) {
  act(() =>
    catalogue.setState({
      status: "ready",
      layers: [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER],
      skipped: Array.from({ length: options.skipped ?? 0 }, () => ({
        problems: ["x"],
      })),
      refresh: options.refresh ?? "idle",
    }),
  );
}

const section = () => screen.getByRole("region", { name: "Layers" });
const tryAgain = () => screen.getByRole("button", { name: "Try again" });

describe("the Layers section while the catalogue loads", () => {
  it("says the layers are loading and marks the section busy, with no layers and no turn-off action", () => {
    show(loadingCatalogue());
    expect(section()).toHaveAttribute("aria-busy", "true");
    expect(section()).toHaveTextContent("Loading layers");
    expect(
      screen.queryByRole("button", { name: /Turn off all layers/ }),
    ).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("goes on to the layers when the list arrives, and is no longer busy", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue);
    expect(section()).not.toHaveAttribute("aria-busy");
    expect(section()).not.toHaveTextContent("Loading layers");
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });
});

describe("the Layers section when the catalogue fails", () => {
  it("says so with a Try again button, and keeps the intro", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    expect(section()).toHaveTextContent("Layers could not be loaded.");
    expect(tryAgain()).toBeEnabled();
    expect(section()).toHaveTextContent(DEFAULT_INTRO);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("asks the catalogue to load again when Try again is pressed", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    act(() => catalogue.setState({ status: "failed", reason: "invalid" }));
    fireEvent.click(tryAgain());
    expect(catalogue.refreshes).toBe(1);
  });

  /** A runtime catalogue whose loads a test settles one at a time. */
  function scripted() {
    const settles: ((outcome: "fail" | "list") => void)[] = [];
    const load = vi.fn(
      () =>
        new Promise<unknown>((resolve, reject) => {
          settles.push((outcome) =>
            outcome === "fail"
              ? reject(new Error("offline"))
              : resolve([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]),
          );
        }),
    );
    const catalogue = createRuntimeLayerCatalogue({
      load,
      options: {
        decoders: createDecoderRegistry(),
        formatters: createFormatterRegistry(),
      },
    });
    const settle = (outcome: "fail" | "list") =>
      act(async () => settles.shift()?.(outcome));
    return { catalogue, settle, load };
  }

  it("keeps focus on Try again, busy, while it retries, and moves it to the Layers heading once the list arrives", async () => {
    const { catalogue, settle } = scripted();
    show(catalogue);
    await settle("fail");
    tryAgain().focus();

    fireEvent.click(tryAgain());
    expect(tryAgain()).toHaveFocus();
    expect(tryAgain()).toHaveAttribute("aria-busy", "true");
    expect(section()).toHaveTextContent("Loading layers");

    await settle("list");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Layers" })).toHaveFocus();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("leaves focus on Try again when the retry fails again", async () => {
    const { catalogue, settle } = scripted();
    show(catalogue);
    await settle("fail");
    tryAgain().focus();
    fireEvent.click(tryAgain());
    await settle("fail");
    expect(section()).toHaveTextContent("Layers could not be loaded.");
    expect(tryAgain()).toHaveFocus();
    expect(tryAgain()).not.toHaveAttribute("aria-busy");
  });

  it("keeps Try again busy and returns focus when the catalogue publishes loading only after refresh() has returned", async () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    tryAgain().focus();
    fireEvent.click(tryAgain());
    // refresh() has returned and the catalogue has said nothing yet.
    await act(async () => undefined);
    act(() => catalogue.setState({ status: "loading" }));
    expect(tryAgain()).toHaveAttribute("aria-busy", "true");
    expect(tryAgain()).toHaveFocus();
    expect(section()).toHaveTextContent("Loading layers");

    readyWith(catalogue);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Layers" })).toHaveFocus();
  });

  it("stays armed until a loading state has been seen and left, so a retry that fails again is not taken for success", async () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    tryAgain().focus();
    fireEvent.click(tryAgain());
    await act(async () => undefined);
    act(() => catalogue.setState({ status: "loading" }));
    act(() => catalogue.setState({ status: "failed", reason: "network" }));
    expect(tryAgain()).toHaveFocus();
    expect(tryAgain()).not.toHaveAttribute("aria-busy");
  });

  it("returns focus to the Layers heading when Try again had focus as a refresh the host started recovered", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue, { refresh: "failed" });
    tryAgain().focus();
    expect(tryAgain()).toHaveFocus();

    readyWith(catalogue);

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Layers" })).toHaveFocus();
  });

  it("leaves focus alone when Try again goes without having had it", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue, { refresh: "failed" });
    readyWith(catalogue);
    expect(screen.getByRole("heading", { name: "Layers" })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it("does not take focus from someone who has gone elsewhere while it retries", async () => {
    const { catalogue, settle } = scripted();
    show(catalogue);
    await settle("fail");
    fireEvent.click(tryAgain());
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    await settle("list");
    expect(elsewhere).toHaveFocus();
    elsewhere.remove();
  });
});

describe("the Layers section when the catalogue is empty", () => {
  it("says there are no layers when the list that was awaited is empty", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    act(() =>
      catalogue.setState({
        status: "ready",
        layers: [],
        skipped: [],
        refresh: "idle",
      }),
    );
    expect(section()).toHaveTextContent("No layers are available.");
    expect(
      screen.queryByRole("button", { name: /Turn off all layers/ }),
    ).toBeNull();
  });

  it("is not shown at all for a host whose first state was ready and empty", () => {
    show(new FakeLayerCatalogue());
    expect(screen.queryByRole("region", { name: "Layers" })).toBeNull();
  });
});

describe("the Layers section when definitions were skipped", () => {
  it("says how many layers could not be shown, in the singular for one, above the layers", () => {
    const catalogue = new FakeLayerCatalogue();
    catalogue.setState({ status: "loading" });
    show(catalogue);
    readyWith(catalogue, { skipped: 1 });
    expect(section()).toHaveTextContent("1 layer could not be shown");
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("counts several", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue, { skipped: 3 });
    expect(section()).toHaveTextContent("3 layers could not be shown");
  });

  it("says nothing when none were skipped", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue);
    expect(section()).not.toHaveTextContent("could not be shown");
  });
});

describe("the Layers section when a refresh fails", () => {
  it("keeps the last list, says so, and offers Try again", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue, { refresh: "failed" });
    expect(section()).toHaveTextContent(
      "Layers could not be updated. Showing the last list.",
    );
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    fireEvent.click(tryAgain());
    expect(catalogue.refreshes).toBe(1);
  });

  it("offers no refresh button while nothing has failed", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue);
    expect(
      screen.queryByRole("button", { name: /try again|refresh|reload/i }),
    ).toBeNull();
  });

  it("says nothing about a refresh that is only loading", () => {
    const catalogue = loadingCatalogue();
    show(catalogue);
    readyWith(catalogue, { refresh: "loading" });
    expect(section()).not.toHaveTextContent("Loading layers");
    expect(section()).not.toHaveTextContent("could not be updated");
    expect(section()).not.toHaveAttribute("aria-busy");
  });
});

describe("the intro", () => {
  it("is the open-data text by default", () => {
    show(new FakeLayerCatalogue([SAMPLE_FEED_LAYER]));
    expect(section()).toHaveTextContent(DEFAULT_INTRO);
  });

  it("is replaced by the host's own text, so a host behind a login does not claim public providers", () => {
    show(new FakeLayerCatalogue([SAMPLE_FEED_LAYER]), {
      intro: "Layers your organisation has shared with you.",
    });
    expect(section()).toHaveTextContent(
      "Layers your organisation has shared with you.",
    );
    expect(section()).not.toHaveTextContent("public providers");
  });

  it("is left out when the host passes an empty one", () => {
    show(new FakeLayerCatalogue([SAMPLE_FEED_LAYER]), { intro: "" });
    expect(section()).not.toHaveTextContent("Open data");
    expect(section().querySelectorAll("p:empty")).toHaveLength(0);
  });
});
