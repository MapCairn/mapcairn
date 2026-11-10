import type { ClipboardPort, ClipboardResult } from "@mapcairn/core";

/** The slice of `navigator` the clipboard adapter reads. */
export interface ClipboardNavigator {
  readonly clipboard?: Pick<Clipboard, "writeText"> | undefined;
}

/** Options for {@link BrowserClipboard}. */
export interface BrowserClipboardOptions {
  /** Returns the navigator. Called on every copy. Defaults to `globalThis.navigator`. */
  readonly getNavigator?: () => ClipboardNavigator | undefined;
  /** Returns the document used by the legacy fallback. Called on every copy. Defaults to `globalThis.document`. */
  readonly getDocument?: () => Document | undefined;
}

type LegacyOutcome = "copied" | "failed" | "unsupported";

function defaultNavigator(): ClipboardNavigator | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

function defaultDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}

/** Browsers refuse a copy outside a user gesture, or without permission, with these names. */
function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

/** Where to put the helper textarea: inside an open modal when there is one, since the rest of the page is inert. */
function mountPoint(doc: Document): Element {
  const active = doc.activeElement;
  const modal = active?.closest("dialog, [role='dialog'], [aria-modal='true']");
  return modal ?? doc.body;
}

/**
 * Copies text with the legacy `execCommand("copy")` route, which iOS Safari
 * needs when the async clipboard API refuses. Restores the focus and the
 * selection it disturbed, and always removes its textarea.
 */
function copyWithTextarea(doc: Document, text: string): LegacyOutcome {
  if (typeof doc.execCommand !== "function" || !doc.body) {
    return "unsupported";
  }
  const previousFocus = doc.activeElement as HTMLElement | null;
  const selection = doc.getSelection?.();
  const previousRanges: Range[] = [];
  for (let index = 0; index < (selection?.rangeCount ?? 0); index += 1) {
    previousRanges.push((selection as Selection).getRangeAt(index));
  }
  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.setAttribute("tabindex", "-1");
  // 16px stops iOS Safari zooming the page when the field is focused.
  textarea.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;";
  try {
    mountPoint(doc).appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    // iOS ignores select() on its own; an explicit range works.
    textarea.setSelectionRange(0, text.length);
    return doc.execCommand("copy") ? "copied" : "failed";
  } catch {
    return "failed";
  } finally {
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      for (const range of previousRanges) {
        selection.addRange(range);
      }
    }
    previousFocus?.focus?.({ preventScroll: true });
  }
}

/**
 * A {@link ClipboardPort} over `navigator.clipboard`, with a legacy fallback.
 *
 * @remarks Safari and iOS rules: the async API works only inside a user
 *   gesture, so `writeText` calls `navigator.clipboard.writeText` before any
 *   `await`, and callers must call `writeText` straight from the event
 *   handler. When the API is missing (an insecure page, an old browser) or
 *   refuses, the adapter falls back to a hidden textarea and
 *   `document.execCommand("copy")`, which still works in that situation.
 *
 *   The result never throws. `denied` means the browser refused the API
 *   (`NotAllowedError` or `SecurityError`) and the fallback did not work
 *   either; `unsupported` means neither route exists; `failed` is anything
 *   else.
 */
export class BrowserClipboard implements ClipboardPort {
  readonly #getNavigator: () => ClipboardNavigator | undefined;
  readonly #getDocument: () => Document | undefined;

  constructor(options: BrowserClipboardOptions = {}) {
    this.#getNavigator = options.getNavigator ?? defaultNavigator;
    this.#getDocument = options.getDocument ?? defaultDocument;
  }

  async writeText(text: string): Promise<ClipboardResult> {
    try {
      return await this.#write(text);
    } catch {
      return { ok: false, reason: "failed" };
    }
  }

  async #write(text: string): Promise<ClipboardResult> {
    const clipboard = this.#getNavigator()?.clipboard;
    let attempted = false;
    let apiError: unknown;
    if (clipboard && typeof clipboard.writeText === "function") {
      attempted = true;
      try {
        await clipboard.writeText(text);
        return { ok: true };
      } catch (error) {
        apiError = error;
      }
    }
    const doc = this.#getDocument();
    const legacy: LegacyOutcome = doc
      ? copyWithTextarea(doc, text)
      : "unsupported";
    if (legacy === "copied") {
      return { ok: true };
    }
    if (attempted) {
      return {
        ok: false,
        reason: isPermissionError(apiError) ? "denied" : "failed",
      };
    }
    return {
      ok: false,
      reason: legacy === "unsupported" ? "unsupported" : "failed",
    };
  }
}
