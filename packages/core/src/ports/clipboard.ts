// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** The result of a copy. */
export type ClipboardResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "denied" | "unsupported" | "failed";
    };

/** Copies text. Never throws. */
export interface ClipboardPort {
  /** Copies text to the clipboard. It resolves to a result and never rejects; a failure carries its reason. */
  writeText(text: string): Promise<ClipboardResult>;
}
