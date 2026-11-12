// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FileSaveResult, FileSaver, SavedFile } from "@mapcairn/core";

/** The slice of the `URL` class the adapter uses. */
export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/** Options for {@link BrowserFileSaver}. */
export interface BrowserFileSaverOptions {
  /** Returns the document the download link is made in. Defaults to `globalThis.document`. */
  readonly getDocument?: () => Document | undefined;
  /** Returns the object URL functions. Defaults to `globalThis.URL`. */
  readonly getObjectUrls?: () => Partial<ObjectUrlApi> | undefined;
  /** Builds the file's `Blob`. Defaults to `new Blob`. */
  readonly createBlob?: (content: string, mimeType: string) => Blob;
  /** How long the object URL stays valid after the click, in milliseconds. Defaults to 30 seconds. */
  readonly revokeAfterMs?: number;
}

const DEFAULT_REVOKE_AFTER_MS = 30_000;

function defaultDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

function defaultObjectUrls(): Partial<ObjectUrlApi> | undefined {
  return typeof URL === "undefined" ? undefined : URL;
}

function defaultCreateBlob(content: string, mimeType: string): Blob {
  return new Blob([content], { type: mimeType });
}

/**
 * A {@link FileSaver} that offers the text as a download: a `Blob`, an object
 * URL and a click on a temporary link with a `download` name. Nothing is sent
 * anywhere.
 *
 * @remarks The object URL is revoked 30 seconds after the click rather than
 *   at once, because Safari can lose the file when it is revoked in the same
 *   task. A missing `document`, `URL.createObjectURL` or `body` is
 *   `unsupported`; anything that throws is `failed`, and the URL is revoked
 *   then too.
 */
export class BrowserFileSaver implements FileSaver {
  readonly #getDocument: () => Document | undefined;
  readonly #getObjectUrls: () => Partial<ObjectUrlApi> | undefined;
  readonly #createBlob: (content: string, mimeType: string) => Blob;
  readonly #revokeAfterMs: number;

  constructor(options: BrowserFileSaverOptions = {}) {
    this.#getDocument = options.getDocument ?? defaultDocument;
    this.#getObjectUrls = options.getObjectUrls ?? defaultObjectUrls;
    this.#createBlob = options.createBlob ?? defaultCreateBlob;
    this.#revokeAfterMs = options.revokeAfterMs ?? DEFAULT_REVOKE_AFTER_MS;
  }

  save(file: SavedFile): Promise<FileSaveResult> {
    const doc = this.#getDocument();
    const urls = this.#getObjectUrls();
    if (
      !doc?.body ||
      typeof urls?.createObjectURL !== "function" ||
      typeof urls.revokeObjectURL !== "function"
    ) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }
    const revoke = urls.revokeObjectURL.bind(urls);
    let href: string | undefined;
    try {
      href = urls.createObjectURL(
        this.#createBlob(file.content, file.mimeType),
      );
      const anchor = doc.createElement("a");
      anchor.href = href;
      anchor.download = file.filename;
      anchor.rel = "noopener";
      anchor.hidden = true;
      doc.body.append(anchor);
      anchor.click();
      anchor.remove();
      const created = href;
      setTimeout(() => revoke(created), this.#revokeAfterMs);
      return Promise.resolve({ ok: true });
    } catch {
      if (href !== undefined) {
        revoke(href);
      }
      return Promise.resolve({ ok: false, reason: "failed" });
    }
  }
}
