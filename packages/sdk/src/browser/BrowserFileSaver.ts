// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FileSaveResult, FileSaver, SavedFile } from "@mapcairn/core";

/**
 * How long an object address stays valid after the click, because Safari can
 * lose the file when it is let go in the same task.
 */
const REVOKE_AFTER_MS = 30_000;

/**
 * A {@link FileSaver} that offers the text as a download: a `Blob`, an object
 * address and a click on a temporary link made inside the map's own element,
 * so a map removed from the page takes nothing with it. Nothing is sent
 * anywhere. {@link BrowserFileSaver.dispose} lets go of every address still
 * held and clears the timers, so a destroyed map leaves nothing behind.
 */
export class BrowserFileSaver implements FileSaver {
  readonly #element: HTMLElement;
  readonly #held = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(element: HTMLElement) {
    this.#element = element;
  }

  save(file: SavedFile): Promise<FileSaveResult> {
    if (
      typeof URL.createObjectURL !== "function" ||
      typeof URL.revokeObjectURL !== "function"
    ) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }
    const href = URL.createObjectURL(
      new Blob([file.content], { type: file.mimeType }),
    );
    try {
      this.#click(href, file.filename);
    } catch {
      URL.revokeObjectURL(href);
      return Promise.resolve({ ok: false, reason: "failed" });
    }
    this.#held.set(
      href,
      setTimeout(() => this.#release(href), REVOKE_AFTER_MS),
    );
    return Promise.resolve({ ok: true });
  }

  /** Lets go of every address still held and clears the timers. Safe to call again. */
  dispose(): void {
    for (const href of [...this.#held.keys()]) {
      this.#release(href);
    }
  }

  #click(href: string, filename: string): void {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.hidden = true;
    this.#element.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  }

  #release(href: string): void {
    clearTimeout(this.#held.get(href));
    this.#held.delete(href);
    URL.revokeObjectURL(href);
  }
}
