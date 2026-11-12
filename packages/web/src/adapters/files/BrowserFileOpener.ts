// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  FileOpenError,
  type FileOpener,
  type FileOpenOptions,
  type OpenedFile,
} from "@mapcairn/core";

/** Options for {@link BrowserFileOpener}. */
export interface BrowserFileOpenerOptions {
  /** Returns the document the file input is made in. Defaults to `globalThis.document`. */
  readonly getDocument?: () => Document | undefined;
}

function defaultDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

/**
 * A {@link FileOpener} that shows the browser's own file picker through a
 * hidden `<input type="file">`, and reads the chosen file with `File.text()`.
 * Nothing is uploaded.
 *
 * @remarks The input is added to the page only while the picker is open and
 *   removed once it settles. Closing the picker fires the input's `cancel`
 *   event in current browsers; where it does not, the open stays waiting
 *   until the next one, which settles it as `cancelled`. A file's size is
 *   checked before it is read. A missing `document` or `body`, or a click
 *   the browser refuses, is `unsupported`; a file that cannot be read is
 *   `unreadable`.
 */
export class BrowserFileOpener implements FileOpener {
  readonly #getDocument: () => Document | undefined;
  #cancelWaiting: (() => void) | null = null;

  constructor(options: BrowserFileOpenerOptions = {}) {
    this.#getDocument = options.getDocument ?? defaultDocument;
  }

  open(options: FileOpenOptions): Promise<OpenedFile> {
    this.#cancelWaiting?.();
    const doc = this.#getDocument();
    if (options.signal?.aborted) {
      return Promise.reject(new FileOpenError("cancelled"));
    }
    if (!doc?.body) {
      return Promise.reject(new FileOpenError("unsupported"));
    }
    const body = doc.body;
    return new Promise<OpenedFile>((resolve, reject) => {
      const input = doc.createElement("input");
      input.type = "file";
      input.accept = options.accept.join(",");
      input.hidden = true;
      let settled = false;
      const settle = (outcome: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        input.removeEventListener("change", onChange);
        input.removeEventListener("cancel", cancel);
        options.signal?.removeEventListener("abort", cancel);
        input.remove();
        if (this.#cancelWaiting === cancel) {
          this.#cancelWaiting = null;
        }
        outcome();
      };
      const fail = (kind: FileOpenError["kind"]) =>
        settle(() => reject(new FileOpenError(kind)));
      const cancel = () => fail("cancelled");
      const onChange = () => {
        const file = input.files?.[0];
        if (!file) {
          cancel();
        } else if (file.size > options.maxBytes) {
          fail("too-large");
        } else {
          file.text().then(
            (text) => settle(() => resolve({ name: file.name, text })),
            () => fail("unreadable"),
          );
        }
      };
      input.addEventListener("change", onChange);
      input.addEventListener("cancel", cancel);
      options.signal?.addEventListener("abort", cancel, { once: true });
      this.#cancelWaiting = cancel;
      body.append(input);
      try {
        input.click();
      } catch {
        fail("unsupported");
      }
    });
  }
}
