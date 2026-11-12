// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  chooseLayout,
  computeBottomSlotLayout,
  computeEndStackMaxHeight,
  isCompactViewport,
  shouldShowZoomButtons,
} from "./layout";

describe("isCompactViewport", () => {
  it("is true for a phone in either orientation", () => {
    expect(isCompactViewport({ width: 390, height: 844 })).toBe(true);
    expect(isCompactViewport({ width: 320, height: 568 })).toBe(true);
    expect(isCompactViewport({ width: 844, height: 390 })).toBe(true);
  });

  it("is false for a tablet or a desktop", () => {
    expect(isCompactViewport({ width: 768, height: 1024 })).toBe(false);
    expect(isCompactViewport({ width: 1280, height: 720 })).toBe(false);
  });

  it("changes at the edges the layout uses: 768 wide and 500 tall", () => {
    expect(isCompactViewport({ width: 767, height: 900 })).toBe(true);
    expect(isCompactViewport({ width: 768, height: 900 })).toBe(false);
    expect(isCompactViewport({ width: 1280, height: 499 })).toBe(true);
    expect(isCompactViewport({ width: 1280, height: 500 })).toBe(false);
  });
});

const base = {
  viewportWidth: 390,
  viewportHeight: 800,
  sheetTopEdge: null,
  sheetDetent: null,
  panelRightEdge: null,
  measureToolbarTop: null,
  inset: 12,
} as const;

describe("computeBottomSlotLayout", () => {
  it("leaves everything at zero with no surface", () => {
    expect(computeBottomSlotLayout({ ...base, layout: "none" })).toEqual({
      bottomStartTranslateX: 0,
      bottomStartTranslateY: 0,
      bottomEndTranslateY: 0,
      hideBottomSlots: false,
    });
  });

  it("lifts both bottom slots to ride above the sheet's top edge", () => {
    // The slots sit `inset` above the viewport bottom. A sheet whose top is
    // at y=600 leaves 200px, so the slots move up by 200 to stay `inset`
    // above it.
    expect(
      computeBottomSlotLayout({
        ...base,
        layout: "sheet",
        sheetTopEdge: 600,
        sheetDetent: "half",
      }),
    ).toEqual({
      bottomStartTranslateX: 0,
      bottomStartTranslateY: -200,
      bottomEndTranslateY: -200,
      hideBottomSlots: false,
    });
  });

  it("does not push the slots down when the sheet's top is below the viewport's edge", () => {
    expect(
      computeBottomSlotLayout({
        ...base,
        layout: "sheet",
        sheetTopEdge: 900,
        sheetDetent: "peek",
      }),
    ).toMatchObject({ bottomEndTranslateY: 0 });
  });

  it("hides the bottom slots at the full detent", () => {
    const result = computeBottomSlotLayout({
      ...base,
      layout: "sheet",
      sheetTopEdge: 12,
      sheetDetent: "full",
    });
    expect(result.hideBottomSlots).toBe(true);
  });

  it("does not hide at peek or half", () => {
    for (const sheetDetent of ["peek", "half"] as const) {
      expect(
        computeBottomSlotLayout({
          ...base,
          layout: "sheet",
          sheetTopEdge: 500,
          sheetDetent,
        }).hideBottomSlots,
      ).toBe(false);
    }
  });

  it("ignores a null sheet edge while the sheet layout is active", () => {
    expect(
      computeBottomSlotLayout({ ...base, layout: "sheet", sheetDetent: "half" })
        .bottomStartTranslateY,
    ).toBe(0);
  });

  it("lifts above the measure toolbar when there is no sheet", () => {
    expect(
      computeBottomSlotLayout({
        ...base,
        layout: "none",
        measureToolbarTop: 700,
      }),
    ).toMatchObject({
      bottomStartTranslateY: -100,
      bottomEndTranslateY: -100,
    });
  });

  it("rides above whichever of the sheet and the toolbar is higher", () => {
    expect(
      computeBottomSlotLayout({
        ...base,
        layout: "sheet",
        sheetTopEdge: 600,
        sheetDetent: "peek",
        measureToolbarTop: 550,
      }).bottomStartTranslateY,
    ).toBe(-250);
    expect(
      computeBottomSlotLayout({
        ...base,
        layout: "sheet",
        sheetTopEdge: 500,
        sheetDetent: "peek",
        measureToolbarTop: 700,
      }).bottomEndTranslateY,
    ).toBe(-300);
  });

  it("never moves the slots down when an edge is below the viewport", () => {
    const result = computeBottomSlotLayout({
      ...base,
      layout: "sheet",
      sheetTopEdge: 900,
      sheetDetent: "peek",
    });
    expect(Object.is(result.bottomStartTranslateY, 0)).toBe(true);
    expect(Object.is(result.bottomEndTranslateY, 0)).toBe(true);
  });

  it("never lifts further than the viewport is tall", () => {
    expect(
      computeBottomSlotLayout({
        ...base,
        layout: "none",
        measureToolbarTop: -50,
      }).bottomStartTranslateY,
    ).toBe(-800);
  });

  it("shifts bottom-start right of a side panel and leaves bottom-end alone", () => {
    expect(
      computeBottomSlotLayout({
        ...base,
        viewportWidth: 1200,
        layout: "panel",
        panelRightEdge: 372,
        sheetTopEdge: 100,
        sheetDetent: "full",
      }),
    ).toEqual({
      bottomStartTranslateX: 372,
      bottomStartTranslateY: 0,
      bottomEndTranslateY: 0,
      hideBottomSlots: false,
    });
  });

  it("still clears the measure toolbar beside a panel", () => {
    expect(
      computeBottomSlotLayout({
        ...base,
        viewportWidth: 1200,
        layout: "panel",
        panelRightEdge: 372,
        measureToolbarTop: 740,
      }),
    ).toMatchObject({
      bottomStartTranslateX: 372,
      bottomStartTranslateY: -60,
      bottomEndTranslateY: -60,
    });
  });

  it("does not shift when the panel edge is unknown", () => {
    expect(
      computeBottomSlotLayout({ ...base, layout: "panel" })
        .bottomStartTranslateX,
    ).toBe(0);
  });

  it("keeps the shift inside the viewport", () => {
    expect(
      computeBottomSlotLayout({
        ...base,
        viewportWidth: 300,
        layout: "panel",
        panelRightEdge: 900,
      }).bottomStartTranslateX,
    ).toBe(300);
    expect(
      computeBottomSlotLayout({
        ...base,
        layout: "panel",
        panelRightEdge: -20,
      }).bottomStartTranslateX,
    ).toBe(0);
  });
});

describe("computeEndStackMaxHeight", () => {
  it("leaves room between the stack's top, the reserved bottom and the inset", () => {
    expect(
      computeEndStackMaxHeight({
        viewportHeight: 800,
        topOffset: 72,
        bottomReserved: 60,
        inset: 12,
      }),
    ).toBe(656);
  });

  it("never returns a negative height", () => {
    expect(
      computeEndStackMaxHeight({
        viewportHeight: 100,
        topOffset: 72,
        bottomReserved: 60,
        inset: 12,
      }),
    ).toBe(0);
  });
});

describe("shouldShowZoomButtons", () => {
  const roomy = { availableHeight: 600, minHeightForZoom: 300 };
  const cramped = { availableHeight: 200, minHeightForZoom: 300 };

  it("always shows when explicitly on, even when cramped", () => {
    for (const finePointer of [true, false]) {
      expect(
        shouldShowZoomButtons({ setting: true, finePointer, ...cramped }),
      ).toEqual({ show: true, yieldedToHeight: false });
    }
  });

  it("never shows when explicitly off", () => {
    expect(
      shouldShowZoomButtons({ setting: false, finePointer: true, ...roomy }),
    ).toEqual({ show: false, yieldedToHeight: false });
  });

  it("follows the pointer by default", () => {
    expect(
      shouldShowZoomButtons({ setting: null, finePointer: true, ...roomy }),
    ).toEqual({ show: true, yieldedToHeight: false });
    expect(
      shouldShowZoomButtons({ setting: null, finePointer: false, ...roomy }),
    ).toEqual({ show: false, yieldedToHeight: false });
  });

  it("yields to height on a fine pointer when the stack is too short", () => {
    expect(
      shouldShowZoomButtons({ setting: null, finePointer: true, ...cramped }),
    ).toEqual({ show: false, yieldedToHeight: true });
  });

  it("shows at exactly the minimum height", () => {
    expect(
      shouldShowZoomButtons({
        setting: null,
        finePointer: true,
        availableHeight: 300,
        minHeightForZoom: 300,
      }).show,
    ).toBe(true);
  });

  it("does not report yielding for a touch device that is also cramped", () => {
    expect(
      shouldShowZoomButtons({ setting: null, finePointer: false, ...cramped }),
    ).toEqual({ show: false, yieldedToHeight: false });
  });
});

describe("chooseLayout", () => {
  it("uses the sheet on narrow, tall screens", () => {
    expect(chooseLayout({ width: 390, height: 844 })).toBe("sheet");
    expect(chooseLayout({ width: 767, height: 500 })).toBe("sheet");
  });

  it("uses the panel from 768px wide", () => {
    expect(chooseLayout({ width: 768, height: 800 })).toBe("panel");
  });

  it("uses the panel on screens shorter than 500px", () => {
    expect(chooseLayout({ width: 390, height: 499 })).toBe("panel");
    expect(chooseLayout({ width: 844, height: 390 })).toBe("panel");
  });
});
