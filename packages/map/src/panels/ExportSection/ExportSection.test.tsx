import {
  createFakeServices,
  DEFAULT_FAKE_VIEW,
  FAKE_VECTOR_BASEMAP,
  FakeMapAdapter,
  FakeMapHost,
  MapEngineError,
} from "@mapcairn/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testMapContext } from "../../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../../host";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { ExportSection } from "./ExportSection";

const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

const DRAWING = {
  colour: "#1a73c8",
  halo: "#ffffff",
  marks: [{ kind: "dot" as const, position: { lat: 1, lng: 2 } }],
};

function setup(
  props: {
    mapless?: boolean;
    credits?: string;
    drawing?: typeof DRAWING;
    blockedBy?: string;
  } = {},
) {
  const adapter = new FakeMapAdapter();
  void adapter.mount(new FakeMapHost(), {
    basemap: FAKE_VECTOR_BASEMAP,
    reducedMotion: true,
    view: DEFAULT_FAKE_VIEW,
  });
  const services = createFakeServices();
  const tree = (blockedBy: string | undefined) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapContext.Provider
          value={testMapContext({ adapter: props.mapless ? null : adapter })}
        >
          <ExportSection
            credits={props.credits ?? "© Example | MapLibre"}
            drawing={props.drawing}
            blockedBy={blockedBy}
          />
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
  const view = render(tree(props.blockedBy));
  return {
    adapter,
    ...view,
    /** Renders again with the terms of a basemap that has come on screen. */
    block: (name: string | undefined) => view.rerender(tree(name)),
  };
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

  it("puts drawn shapes into the image, because the engine does not hold them", async () => {
    const { adapter } = setup({ drawing: DRAWING });
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(adapter.imageRequests).toEqual([
      { attribution: "© Example | MapLibre", drawing: DRAWING },
    ]);
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

  it("logs a failure, which the person is told about without its technical detail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { adapter } = setup();
    adapter.failNextImage();
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    expect(log.mock.calls[0]?.[1]).toBeInstanceOf(MapEngineError);
    expect(screen.getByTestId("export-error")).not.toHaveTextContent(
      "fake map",
    );
  });

  it("tells a refusal by the map for a basemap's terms apart from any other failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { adapter } = setup();
    vi.spyOn(adapter, "toImage").mockRejectedValue(
      new MapEngineError("export-blocked", "Terms."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(assertive()).toBe(
        "The map image was not saved. The terms of the basemap do not allow saving images of its map.",
      ),
    );
    expect(screen.getByTestId("export-error")).toHaveTextContent(
      "Choose another basemap",
    );
    expect(log).toHaveBeenCalledOnce();
    expect(clicks).toHaveLength(0);
  });

  it("throws the image away when a basemap that forbids saved images came on screen while it was made", async () => {
    const { adapter, block } = setup();
    let finish: (blob: Blob) => void = () => {};
    vi.spyOn(adapter, "toImage").mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    block("Fake credited");
    finish(new Blob(["x"], { type: "image/png" }));
    await waitFor(() =>
      expect(assertive()).toBe(
        "The map image was not saved. The terms of Fake credited do not allow saving images of its map.",
      ),
    );
    expect(clicks).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(polite()).not.toBe("Map image saved.");
    // The section already says why, so the failure is not told twice.
    expect(screen.queryByTestId("export-error")).toBeNull();
    expect(screen.getByTestId("export-blocked")).toBeVisible();
  });

  it("drops a failure message when the terms that blocked the image go away", async () => {
    const { adapter, block } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(adapter, "toImage").mockRejectedValue(
      new MapEngineError("export-blocked", "Terms."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(screen.getByTestId("export-error")).toHaveTextContent(
        "The map image was not saved.",
      ),
    );
    block("Fake credited");
    expect(screen.queryByTestId("export-error")).toBeNull();
    block(undefined);
    expect(screen.queryByTestId("export-error")).toBeNull();
    expect(screen.getByTestId("sheet-section-export")).toHaveTextContent("PNG");
  });

  it("drops an ordinary failure message when a basemap that forbids images comes on screen", async () => {
    const { adapter, block } = setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    adapter.failNextImage();
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(screen.getByTestId("export-error")).toBeVisible(),
    );
    block("Fake credited");
    block(undefined);
    expect(screen.queryByTestId("export-error")).toBeNull();
  });

  it("is disabled until the map has started", () => {
    setup({ mapless: true });
    expect(screen.getByRole("button", { name: "Save image" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  describe("when a basemap's terms do not allow saved images", () => {
    it("turns the button off and says why, in words the button points to", () => {
      setup({ blockedBy: "Fake credited" });
      const button = screen.getByRole("button", { name: "Save image" });
      expect(button).toHaveAttribute("aria-disabled", "true");
      const reason = screen.getByTestId("export-blocked");
      expect(reason).toBeVisible();
      expect(reason).toHaveTextContent(
        "The terms of Fake credited do not allow saving images of its map. Choose another basemap to save an image.",
      );
      expect(button.getAttribute("aria-describedby")).toBe(reason.id);
      expect(reason.id).not.toBe("");
    });

    it("keeps the button focusable and asks the map for nothing when pressed", async () => {
      const { adapter } = setup({ blockedBy: "Fake credited" });
      const button = screen.getByRole("button", { name: "Save image" });
      button.focus();
      expect(button).toHaveFocus();
      fireEvent.click(button);
      await Promise.resolve();
      expect(adapter.imageRequests).toEqual([]);
      expect(clicks).toHaveLength(0);
    });

    it("does not describe the button when nothing blocks it", () => {
      setup();
      expect(screen.queryByTestId("export-blocked")).toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Save image" })
          .hasAttribute("aria-describedby"),
      ).toBe(false);
    });

    it("does not say the image is made in the browser and sent nowhere as an offer", () => {
      setup({ blockedBy: "Fake credited" });
      expect(screen.getByTestId("sheet-section-export")).not.toHaveTextContent(
        "Saves the map as it looks now",
      );
    });
  });
});
