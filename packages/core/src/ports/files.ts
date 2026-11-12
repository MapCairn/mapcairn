// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** A file the person is offered to keep. */
export interface SavedFile {
  /** The name the file is saved under, for example `shapes.geojson`. */
  readonly filename: string;
  /** The media type, for example `application/geo+json`. */
  readonly mimeType: string;
  /** The text of the file. */
  readonly content: string;
}

/** The result of offering a file. */
export type FileSaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "unsupported" | "failed" };

/**
 * Offers a file for the person to keep, as a download. Nothing is sent
 * anywhere: the browser builds the file from the text it is given. Never
 * throws.
 */
export interface FileSaver {
  save(file: SavedFile): Promise<FileSaveResult>;
}

/** What the person is asked to choose from, and how much may be read. */
export interface FileOpenOptions {
  /**
   * The file types the picker offers, as extensions (`.geojson`) and media
   * types (`application/geo+json`). The picker may still let the person
   * choose any file, so the caller checks what it reads.
   */
  readonly accept: readonly string[];
  /** The largest file that is read, in bytes. A larger one is refused before it is read. */
  readonly maxBytes: number;
  /** Cancels the open: a pending picker settles as `cancelled`. */
  readonly signal?: AbortSignal;
}

/** A file the person chose, read as text. */
export interface OpenedFile {
  /** The file's name, for example `shapes.geojson`. Never a path. */
  readonly name: string;
  /** The whole file, decoded as UTF-8. */
  readonly text: string;
}

/**
 * Asks the person to choose a file and reads it as text. Nothing is
 * uploaded: the file is read in the browser and given only to the caller.
 * Rejects only with a `FileOpenError`.
 *
 * @remarks Call `open` straight from the handler of the press that asked
 *   for it, before any `await`, or a browser may refuse to show the picker.
 *   A second `open` while one is waiting settles the first as `cancelled`.
 */
export interface FileOpener {
  open(options: FileOpenOptions): Promise<OpenedFile>;
}
