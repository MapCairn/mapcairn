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
