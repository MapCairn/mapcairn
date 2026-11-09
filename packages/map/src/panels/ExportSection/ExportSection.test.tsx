import {
  createFakeServices,
  DEFAULT_FAKE_VIEW,
  FAKE_VECTOR_BASEMAP,
  FakeMapAdapter,
  FakeMapHost,
} from "@karta/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testMapContext } from "../../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../../host";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { ExportSection } from "./ExportSection";

const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

function setup(props: { mapless?: boolean; credits?: string } = {}) {
  const adapter = new FakeMapAdapter();
  void adapter.mount(new FakeMapHost(), {
    basemap: FAKE_VECTOR_BASEMAP,
    reducedMotion: true,
    view: DEFAULT_FAKE_VIEW,
  });
  const view = render(
    <ServicesProvider services={createFakeServices()}>
      <LiveRegionProvider>
        <MapContext.Provider
          value={testMapContext({ adapter: props.mapless ? null : adapter })}
        >
          <ExportSection credits={props.credits ?? "© Example | MapLibre"} />
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { adapter, ...view };
}

describe("ExportSection", () => {
  const clicks: { href: string; download: string }[] = [];

  beforeEach(() => {
    clicks.length = 0;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:saved-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a region named Save image with a button that says what it saves", () => {
    setup();
    expect(screen.getByRole("region", { name: "Save image" })).toBe(
      screen.getByTestId("sheet-section-export"),
    );
    expect(
      screen.getByRole("button", { name: "Save image" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sheet-section-export")).toHaveTextContent("PNG");
  });

  it("asks the map for an image with the credits drawn in, and saves it as a file", async () => {
    const { adapter } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(adapter.imageRequests).toEqual([
      { attribution: "© Example | MapLibre" },
    ]);
    expect(clicks[0]?.href).toBe("blob:saved-image");
    expect(clicks[0]?.download).toMatch(/^map-\d{4}-\d{2}-\d{2}\.png$/);
    await waitFor(() => expect(polite()).toBe("Map image saved."));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:saved-image");
  });

  it("works from the keyboard", async () => {
    setup();
    const button = screen.getByRole("button", { name: "Save image" });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    await waitFor(() => expect(clicks).toHaveLength(1));
  });

  it("is busy while the image is made, and ignores a second press", async () => {
    const { adapter } = setup();
    let finish: (blob: Blob) => void = () => {};
    vi.spyOn(adapter, "toImage").mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    expect(screen.getByRole("button", { name: "Save image" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    expect(adapter.toImage).toHaveBeenCalledTimes(1);
    finish(new Blob(["x"], { type: "image/png" }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save image" }),
      ).not.toHaveAttribute("aria-busy", "true"),
    );
  });

  it("says so, assertively, when the image cannot be made, and can be tried again", async () => {
    const { adapter } = setup();
    adapter.failNextImage();
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(assertive()).toBe("The map image could not be saved. Try again."),
    );
    expect(screen.getByTestId("export-error")).toHaveTextContent(
      "could not be saved",
    );
    expect(clicks).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(screen.queryByTestId("export-error")).toBeNull();
  });

  it("is disabled until the map has started", () => {
    setup({ mapless: true });
    expect(screen.getByRole("button", { name: "Save image" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
