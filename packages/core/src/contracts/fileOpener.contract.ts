import { describe, expect, it } from "vitest";
import { FileOpenError, type FileOpenErrorKind } from "../ports/errors";
import type { FileOpener, FileOpenOptions, OpenedFile } from "../ports/files";

/**
 * How the file opener contract plays the person and the browser. A real
 * adapter implements these by acting on the file input it shows.
 */
export interface FileOpenerControls {
  /** The person chooses this file in the picker that is open. */
  choose(file: OpenedFile): void;
  /** The person closes the picker without choosing. */
  cancel(): void;
  /**
   * Makes later opens fail: `unsupported` at once, as a browser that cannot
   * open files does, and `unreadable` when the person chooses a file.
   */
  willFail(
    kind: Extract<FileOpenErrorKind, "unsupported" | "unreadable">,
  ): void;
}

/** One file opener under test, with its controls. */
export interface FileOpenerSubject {
  readonly opener: FileOpener;
  readonly controls: FileOpenerControls;
}

const OPTIONS: FileOpenOptions = {
  accept: [".geojson", ".csv"],
  maxBytes: 100,
};

const FILE: OpenedFile = {
  name: "shapes.geojson",
  text: '{"type":"FeatureCollection","features":[]}',
};

/** The kind a promise rejects with, or a note that it did something else. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error instanceof FileOpenError ? error.kind : error;
  }
}

/**
 * Runs the shared behavioural suite for a {@link FileOpener}. Every test
 * calls `create` for a fresh subject.
 */
export function runFileOpenerContract(
  name: string,
  create: () => FileOpenerSubject,
): void {
  describe(`FileOpener contract: ${name}`, () => {
    it("resolves the name and text of the file the person chooses", async () => {
      const { opener, controls } = create();
      const opened = opener.open(OPTIONS);
      controls.choose(FILE);
      expect(await opened).toEqual(FILE);
    });

    it("keeps line ends, quotes and non-Latin text exactly", async () => {
      const { opener, controls } = create();
      const text = 'id,name\r\n1,"Nairobi, ""東京"""\n';
      const opened = opener.open({ ...OPTIONS, maxBytes: 1000 });
      controls.choose({ name: "a.csv", text });
      expect(await opened).toEqual({ name: "a.csv", text });
    });

    it("rejects as cancelled when the person closes the picker", async () => {
      const { opener, controls } = create();
      const opened = opener.open(OPTIONS);
      controls.cancel();
      expect(await rejection(opened)).toBe("cancelled");
    });

    it("rejects as too-large a file over the limit, without reading it", async () => {
      const { opener, controls } = create();
      const opened = opener.open(OPTIONS);
      controls.choose({ name: "big.geojson", text: "x".repeat(101) });
      expect(await rejection(opened)).toBe("too-large");
    });

    it("rejects as cancelled when the caller aborts while the picker is open", async () => {
      const { opener } = create();
      const controller = new AbortController();
      const opened = opener.open({ ...OPTIONS, signal: controller.signal });
      controller.abort();
      expect(await rejection(opened)).toBe("cancelled");
    });

    it("rejects as cancelled at once when the signal has already fired", async () => {
      const { opener } = create();
      const controller = new AbortController();
      controller.abort();
      expect(
        await rejection(opener.open({ ...OPTIONS, signal: controller.signal })),
      ).toBe("cancelled");
    });

    it("cancels a waiting open when another starts, and serves the new one", async () => {
      const { opener, controls } = create();
      const first = opener.open(OPTIONS);
      const second = opener.open(OPTIONS);
      controls.choose(FILE);
      expect(await rejection(first)).toBe("cancelled");
      expect(await second).toEqual(FILE);
    });

    it("rejects as unreadable a file that cannot be read", async () => {
      const { opener, controls } = create();
      controls.willFail("unreadable");
      const opened = opener.open(OPTIONS);
      controls.choose(FILE);
      expect(await rejection(opened)).toBe("unreadable");
    });

    it("rejects as unsupported where files cannot be opened", async () => {
      const { opener, controls } = create();
      controls.willFail("unsupported");
      expect(await rejection(opener.open(OPTIONS))).toBe("unsupported");
    });
  });
}
