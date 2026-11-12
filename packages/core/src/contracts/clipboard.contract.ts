// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { ClipboardPort, ClipboardResult } from "../ports/clipboard";

/** The reasons a copy can fail, as the port defines them. */
export type ClipboardContractFailure = Extract<
  ClipboardResult,
  { ok: false }
>["reason"];

/**
 * How the clipboard contract scripts a port. A real adapter implements these
 * by mocking `navigator.clipboard` and, for the fallback path, `execCommand`.
 */
export interface ClipboardControls {
  /** Makes every later copy succeed. */
  willSucceed(): void;
  /** Makes every later copy fail the way `reason` describes. */
  willFail(reason: ClipboardContractFailure): void;
  /** The text of every copy that succeeded, oldest first. */
  written(): readonly string[];
}

/** One clipboard port under test, with its controls. */
export interface ClipboardSubject {
  readonly clipboard: ClipboardPort;
  readonly controls: ClipboardControls;
}

const FAILURES: readonly ClipboardContractFailure[] = [
  "denied",
  "unsupported",
  "failed",
];

/**
 * Runs the shared behavioural suite for a {@link ClipboardPort}. Every test
 * calls `create` for a fresh subject.
 */
export function runClipboardContract(
  name: string,
  create: () => ClipboardSubject,
): void {
  describe(`ClipboardPort contract: ${name}`, () => {
    it("resolves ok and writes the text when the copy succeeds", async () => {
      const { clipboard, controls } = create();
      controls.willSucceed();
      const result = await clipboard.writeText(
        "https://example.org/#map=12/-33.9/18.4",
      );
      expect(result).toEqual({ ok: true });
      expect(controls.written().at(-1)).toBe(
        "https://example.org/#map=12/-33.9/18.4",
      );
    });

    it("copies empty text without rejecting", async () => {
      const { clipboard, controls } = create();
      controls.willSucceed();
      await expect(clipboard.writeText("")).resolves.toHaveProperty("ok");
    });

    for (const reason of FAILURES) {
      it(`resolves a ${reason} failure with its reason instead of rejecting`, async () => {
        const { clipboard, controls } = create();
        controls.willFail(reason);
        const result = await clipboard.writeText("text");
        expect(result).toEqual({ ok: false, reason });
        expect(controls.written()).not.toContain("text");
      });
    }

    it("always resolves a ClipboardResult", async () => {
      const { clipboard, controls } = create();
      for (const arrange of [
        () => controls.willSucceed(),
        () => controls.willFail("denied"),
      ]) {
        arrange();
        const result = await clipboard.writeText("text");
        expect(typeof result.ok).toBe("boolean");
        if (!result.ok) {
          expect(FAILURES).toContain(result.reason);
        }
      }
    });
  });
}
