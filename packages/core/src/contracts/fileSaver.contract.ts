// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { FileSaveResult, FileSaver, SavedFile } from "../ports/files";

/** The reasons a save can fail, as the port defines them. */
export type FileSaverContractFailure = Extract<
  FileSaveResult,
  { ok: false }
>["reason"];

/**
 * How the file saver contract scripts a port. A real adapter implements these
 * by providing or hiding the browser's file and download support.
 */
export interface FileSaverControls {
  /** Makes every later save succeed. */
  willSucceed(): void;
  /** Makes every later save fail the way `reason` describes. */
  willFail(reason: FileSaverContractFailure): void;
  /** The files that were saved, oldest first. */
  saved(): readonly SavedFile[];
}

/** One file saver under test, with its controls. */
export interface FileSaverSubject {
  readonly files: FileSaver;
  readonly controls: FileSaverControls;
}

const FAILURES: readonly FileSaverContractFailure[] = ["unsupported", "failed"];

const FILE: SavedFile = {
  filename: "shapes.geojson",
  mimeType: "application/geo+json",
  content: '{"type":"FeatureCollection","features":[]}',
};

/**
 * Runs the shared behavioural suite for a {@link FileSaver}. Every test calls
 * `create` for a fresh subject.
 */
export function runFileSaverContract(
  name: string,
  create: () => FileSaverSubject,
): void {
  describe(`FileSaver contract: ${name}`, () => {
    it("resolves ok and keeps the name, type and text when the save succeeds", async () => {
      const { files, controls } = create();
      controls.willSucceed();
      expect(await files.save(FILE)).toEqual({ ok: true });
      expect(controls.saved().at(-1)).toEqual(FILE);
    });

    it("saves an empty file without rejecting", async () => {
      const { files, controls } = create();
      controls.willSucceed();
      const result = await files.save({ ...FILE, content: "" });
      expect(result.ok).toBe(true);
    });

    it("keeps quotes, commas, new lines and non-Latin text exactly", async () => {
      const { files, controls } = create();
      controls.willSucceed();
      const content = 'id,geometry\r\n1,"{""a"":1}"\r\nNairobi, 東京';
      await files.save({ ...FILE, filename: "a.csv", content });
      expect(controls.saved().at(-1)?.content).toBe(content);
    });

    for (const reason of FAILURES) {
      it(`resolves a ${reason} failure with its reason instead of rejecting`, async () => {
        const { files, controls } = create();
        controls.willFail(reason);
        expect(await files.save(FILE)).toEqual({ ok: false, reason });
        expect(controls.saved()).toEqual([]);
      });
    }
  });
}
