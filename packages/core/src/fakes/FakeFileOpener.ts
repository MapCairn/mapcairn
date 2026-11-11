import { FileOpenError, type FileOpenErrorKind } from "../ports/errors";
import type { FileOpener, FileOpenOptions, OpenedFile } from "../ports/files";

/** What the fake can be made to fail with before a file is chosen. */
export type FakeFileOpenFailure = Extract<
  FileOpenErrorKind,
  "unsupported" | "unreadable"
>;

interface Waiting {
  readonly options: FileOpenOptions;
  readonly resolve: (file: OpenedFile) => void;
  readonly reject: (error: FileOpenError) => void;
  readonly stop: () => void;
}

/**
 * A scripted {@link FileOpener} that plays the person at the picker.
 *
 * How to script it: `open` waits, as a real picker does, until `choose(file)`
 * or `cancel()` settles it. `failWith("unsupported")` makes later opens
 * reject at once, `failWith("unreadable")` makes a chosen file unreadable,
 * and `succeed()` clears either. A chosen file's size is its length in
 * characters. `opens` records the options of every call and `waiting` says
 * whether a picker is open. It rejects only with `FileOpenError`.
 */
export class FakeFileOpener implements FileOpener {
  readonly opens: FileOpenOptions[] = [];

  #failure: FakeFileOpenFailure | null = null;
  #waiting: Waiting | null = null;

  /** Whether a picker is open and waiting for the person. */
  get waiting(): boolean {
    return this.#waiting !== null;
  }

  /** Makes later opens fail this way. */
  failWith(kind: FakeFileOpenFailure): void {
    this.#failure = kind;
  }

  /** Makes later opens work again. */
  succeed(): void {
    this.#failure = null;
  }

  open(options: FileOpenOptions): Promise<OpenedFile> {
    this.opens.push(options);
    this.#settle((waiting) => waiting.reject(new FileOpenError("cancelled")));
    if (options.signal?.aborted) {
      return Promise.reject(new FileOpenError("cancelled"));
    }
    if (this.#failure === "unsupported") {
      return Promise.reject(new FileOpenError("unsupported"));
    }
    return new Promise<OpenedFile>((resolve, reject) => {
      const onAbort = () =>
        this.#settle((waiting) =>
          waiting.reject(new FileOpenError("cancelled")),
        );
      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.#waiting = {
        options,
        resolve,
        reject,
        stop: () => options.signal?.removeEventListener("abort", onAbort),
      };
    });
  }

  /** The person chooses `file` in the open picker. Does nothing when none is open. */
  choose(file: OpenedFile): void {
    const failure = this.#failure;
    this.#settle((waiting) => {
      if (file.text.length > waiting.options.maxBytes) {
        waiting.reject(new FileOpenError("too-large"));
      } else if (failure === "unreadable") {
        waiting.reject(new FileOpenError("unreadable"));
      } else {
        waiting.resolve(file);
      }
    });
  }

  /** The person closes the open picker without choosing. */
  cancel(): void {
    this.#settle((waiting) => waiting.reject(new FileOpenError("cancelled")));
  }

  #settle(settle: (waiting: Waiting) => void): void {
    const waiting = this.#waiting;
    if (!waiting) {
      return;
    }
    this.#waiting = null;
    waiting.stop();
    settle(waiting);
  }
}
