// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { pngHeader, readPngSize } from "./pngHeader";

describe("pngHeader", () => {
  it("starts with the PNG signature and carries the size, which readPngSize reads back", async () => {
    const header = pngHeader(1280, 960);
    expect([...header.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(await readPngSize(new Blob([header]))).toEqual({
      width: 1280,
      height: 960,
    });
  });

  it("reads nothing from bytes that are not the start of a PNG", async () => {
    const good = pngHeader(10, 20);
    const read = (bytes: Uint8Array) => readPngSize(new Blob([bytes]));
    expect(await read(new Uint8Array())).toBeUndefined();
    expect(await read(good.subarray(0, 23))).toBeUndefined();
    const notPng = Uint8Array.from(good);
    notPng[1] = 0x00;
    expect(await read(notPng)).toBeUndefined();
    const notHeader = Uint8Array.from(good);
    notHeader[12] = 0x49;
    notHeader[13] = 0x44;
    notHeader[14] = 0x41;
    notHeader[15] = 0x54;
    expect(await read(notHeader)).toBeUndefined();
    expect(
      await read(new TextEncoder().encode("not a png at all, no")),
    ).toBeUndefined();
  });

  it("reads the size of a real PNG header", async () => {
    // A 1 by 1 PNG as written by an encoder.
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
      ),
      (character) => character.charCodeAt(0),
    );
    expect(await readPngSize(new Blob([png]))).toEqual({ width: 1, height: 1 });
  });
});
