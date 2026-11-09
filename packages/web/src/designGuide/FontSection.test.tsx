import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDocumentFont, FontSection } from "./FontSection";
import { fontFamilies } from "./fontGate";

const { primary } = fontFamilies();

/** Puts a scripted font set on the document, as `document.fonts`. */
function stubFonts(check: boolean): void {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: () => Promise.resolve([]),
      check: () => check,
      ready: Promise.resolve(),
    },
  });
}

/** Makes the canvas measure Plex and the fallback at the given widths. */
function stubCanvas(widths: { plex: number; fallback: number } | null): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    if (widths === null) {
      return null;
    }
    const context = {
      font: "",
      measureText: () => ({
        width: context.font.includes(primary) ? widths.plex : widths.fallback,
      }),
    };
    return context as unknown as CanvasRenderingContext2D;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fonts");
});

describe("checkDocumentFont", () => {
  it("passes when the document's fonts load and the canvas measures Plex wider than the fallback", async () => {
    stubFonts(true);
    stubCanvas({ plex: 640, fallback: 600 });
    expect(await checkDocumentFont()).toEqual({ loaded: true, reason: "" });
  });

  it("fails when the canvas measures the same width for both", async () => {
    stubFonts(true);
    stubCanvas({ plex: 600, fallback: 600 });
    expect((await checkDocumentFont()).loaded).toBe(false);
  });

  it("fails when there is no 2D canvas to measure with", async () => {
    stubFonts(true);
    stubCanvas(null);
    expect((await checkDocumentFont()).loaded).toBe(false);
  });

  it("fails when the browser has no font loading API", async () => {
    Reflect.deleteProperty(document, "fonts");
    const result = await checkDocumentFont();
    expect(result.loaded).toBe(false);
    expect(result.reason).toMatch(/no font loading API/);
  });
});

describe("FontSection", () => {
  it("is pending until the check settles", () => {
    render(<FontSection checkFont={() => new Promise(() => undefined)} />);
    const gate = screen.getByTestId("font-gate");
    expect(gate).toHaveAttribute("data-font-loaded", "pending");
    expect(gate).toHaveTextContent("Checking which font is rendering");
  });

  it("reports a check that throws as a font that did not load", async () => {
    render(
      <FontSection checkFont={() => Promise.reject(new Error("broken"))} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const gate = screen.getByTestId("font-gate");
    expect(gate).toHaveAttribute("data-font-loaded", "false");
    expect(gate).toHaveTextContent("The font check failed.");
  });

  it("ignores a result that arrives after it unmounts", async () => {
    let resolve: (value: { loaded: boolean; reason: string }) => void = () =>
      undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const first = render(
      <FontSection
        checkFont={() =>
          new Promise((done) => {
            resolve = done;
          })
        }
      />,
    );
    first.unmount();
    const second = render(
      <FontSection
        checkFont={() =>
          new Promise((_done, fail) => {
            reject = fail;
          })
        }
      />,
    );
    second.unmount();
    await act(async () => {
      resolve({ loaded: true, reason: "" });
      reject(new Error("late"));
      await Promise.resolve();
    });
    expect(screen.queryByTestId("font-gate")).toBeNull();
  });
});
