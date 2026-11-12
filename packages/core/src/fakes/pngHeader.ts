// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The eight bytes every PNG file starts with. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The name of the chunk that follows the signature, which holds the size. */
const IHDR_NAME = [0x49, 0x48, 0x44, 0x52];

/** Where that chunk's name sits: after the signature and the chunk's length. */
const IHDR_NAME_OFFSET = 12;

/** Where the width and height sit in a PNG: after the signature, a chunk length and the `IHDR` name. */
const SIZE_OFFSET = 16;

/** The bytes of a PNG up to and including its `IHDR` chunk's width and height. */
const HEADER_BYTES = SIZE_OFFSET + 8;

/** Whether bytes begin with the PNG signature and then an `IHDR` chunk. */
function startsLikeIhdrPng(bytes: Uint8Array): boolean {
  const matches = (expected: readonly number[], offset: number) =>
    expected.every((byte, index) => bytes[offset + index] === byte);
  return matches(PNG_SIGNATURE, 0) && matches(IHDR_NAME, IHDR_NAME_OFFSET);
}

/**
 * The start of a PNG of a given size: its signature and the width and height
 * of its `IHDR` chunk. It is not a whole image, but a fake can return it so a
 * test can read the size an adapter was asked to draw with {@link readPngSize},
 * and a real PNG reads the same way.
 */
export function pngHeader(
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(HEADER_BYTES);
  bytes.set(PNG_SIGNATURE);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(IHDR_NAME, IHDR_NAME_OFFSET);
  view.setUint32(SIZE_OFFSET, width);
  view.setUint32(SIZE_OFFSET + 4, height);
  return bytes;
}

/**
 * Reads the pixel size from the start of a PNG blob: the fake's header or a
 * real file. Gives `undefined` for bytes that are not the start of a PNG (too
 * short, no signature, or no `IHDR` chunk first), so a test fails on what it
 * was given rather than on a number read from nowhere.
 */
export async function readPngSize(
  blob: Blob,
): Promise<{ readonly width: number; readonly height: number } | undefined> {
  const bytes = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
  if (bytes.length < HEADER_BYTES || !startsLikeIhdrPng(bytes)) {
    return undefined;
  }
  const view = new DataView(bytes.buffer);
  return {
    width: view.getUint32(SIZE_OFFSET),
    height: view.getUint32(SIZE_OFFSET + 4),
  };
}
