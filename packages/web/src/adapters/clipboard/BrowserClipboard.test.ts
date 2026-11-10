import { runClipboardContract } from "@mapcairn/core/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserClipboard, type ClipboardNavigator } from "./BrowserClipboard";

type Reason = "denied" | "unsupported" | "failed";

function permissionError(): Error {
  const error = new Error("not allowed");
  error.name = "NotAllowedError";
  return error;
}

interface Rig {
  readonly clipboard: BrowserClipboard;
  readonly written: string[];
  readonly writeText: ReturnType<typeof vi.fn>;
  readonly execCommand: ReturnType<typeof vi.fn>;
  /** The textareas the legacy route created, to check they were removed. */
  readonly textareas: HTMLTextAreaElement[];
  readonly arrange: {
    succeed(): void;
    fail(reason: Reason): void;
  };
}

/**
 * Builds a clipboard over a scripted navigator and the happy-dom document,
 * which has no `execCommand`, so the rig supplies one.
 */
function rig(): Rig {
  const written: string[] = [];
  const textareas: HTMLTextAreaElement[] = [];
  const writeText = vi.fn<(text: string) => Promise<void>>();
  const execCommand = vi.fn<(command: string) => boolean>();
  let navigatorLike: ClipboardNavigator | undefined = {
    clipboard: { writeText },
  };
  let execCommandAvailable = true;
  const doc = document as Document & { execCommand?: unknown };
  Object.defineProperty(doc, "execCommand", {
    configurable: true,
    get: () => (execCommandAvailable ? execCommand : undefined),
  });
  execCommand.mockImplementation((command) => {
    const textarea = doc.querySelector("textarea");
    if (textarea) {
      textareas.push(textarea);
    }
    return command === "copy" && textarea !== null && shouldCopy;
  });
  let shouldCopy = true;
  const clipboard = new BrowserClipboard({
    getNavigator: () => navigatorLike,
    getDocument: () => document,
  });
  return {
    clipboard,
    written,
    writeText,
    execCommand,
    textareas,
    arrange: {
      succeed() {
        navigatorLike = { clipboard: { writeText } };
        writeText.mockImplementation(async (text) => {
          written.push(text);
        });
      },
      fail(reason) {
        shouldCopy = false;
        if (reason === "unsupported") {
          navigatorLike = {};
          execCommandAvailable = false;
          return;
        }
        navigatorLike = { clipboard: { writeText } };
        writeText.mockImplementation(async () => {
          throw reason === "denied" ? permissionError() : new Error("broke");
        });
      },
    },
  };
}

afterEach(() => {
  Reflect.deleteProperty(document, "execCommand");
  document.body.replaceChildren();
});

runClipboardContract("BrowserClipboard", () => {
  const current = rig();
  return {
    clipboard: current.clipboard,
    controls: {
      willSucceed: current.arrange.succeed,
      willFail: current.arrange.fail,
      written: () => current.written,
    },
  };
});

describe("BrowserClipboard", () => {
  it("calls the async API synchronously, inside the user gesture", () => {
    const { clipboard, writeText, arrange } = rig();
    arrange.succeed();
    void clipboard.writeText("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("does not use the legacy route when the async API works", async () => {
    const { clipboard, execCommand, arrange } = rig();
    arrange.succeed();
    await clipboard.writeText("hello");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to a textarea when the async API refuses", async () => {
    const { clipboard, execCommand, textareas, writeText } = rig();
    writeText.mockRejectedValue(permissionError());
    expect(await clipboard.writeText("copy me")).toEqual({ ok: true });
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textareas).toHaveLength(1);
    expect(textareas[0]?.value).toBe("copy me");
  });

  it("falls back to a textarea when the page has no async API", async () => {
    const written: string[] = [];
    const doc = document as Document & { execCommand?: unknown };
    Object.defineProperty(doc, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        written.push(document.querySelector("textarea")?.value ?? "");
        return true;
      }),
    });
    const clipboard = new BrowserClipboard({
      getNavigator: () => ({}),
      getDocument: () => document,
    });
    expect(await clipboard.writeText("old browser")).toEqual({ ok: true });
    expect(written).toEqual(["old browser"]);
  });

  it("removes its textarea after success, failure and a throwing execCommand", async () => {
    const current = rig();
    current.writeText.mockRejectedValue(permissionError());
    await current.clipboard.writeText("a");
    expect(document.querySelector("textarea")).toBeNull();
    current.arrange.fail("failed");
    await current.clipboard.writeText("b");
    expect(document.querySelector("textarea")).toBeNull();
    current.execCommand.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(await current.clipboard.writeText("c")).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("restores the focus it disturbed", async () => {
    const current = rig();
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    current.writeText.mockRejectedValue(permissionError());
    await current.clipboard.writeText("a");
    expect(document.activeElement).toBe(button);
  });

  it("puts the textarea inside an open dialog so an inert page does not block the copy", async () => {
    const current = rig();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);
    button.focus();
    current.writeText.mockRejectedValue(permissionError());
    current.execCommand.mockImplementation(() => {
      expect(dialog.querySelector("textarea")).not.toBeNull();
      return true;
    });
    await current.clipboard.writeText("a");
  });

  it("styles the helper textarea so it is invisible and cannot zoom iOS", async () => {
    const current = rig();
    current.writeText.mockRejectedValue(permissionError());
    await current.clipboard.writeText("a");
    const textarea = current.textareas[0];
    expect(textarea?.style.fontSize).toBe("16px");
    expect(textarea?.style.opacity).toBe("0");
    expect(textarea?.getAttribute("aria-hidden")).toBe("true");
  });

  it("reports failed when the async API fails for a reason other than permission", async () => {
    const current = rig();
    current.arrange.fail("failed");
    expect(await current.clipboard.writeText("a")).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("reports unsupported when there is no document at all", async () => {
    const clipboard = new BrowserClipboard({
      getNavigator: () => undefined,
      getDocument: () => undefined,
    });
    expect(await clipboard.writeText("a")).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("reports failed when only the legacy route exists and it refuses", async () => {
    const current = rig();
    current.arrange.fail("failed");
    const clipboard = new BrowserClipboard({
      getNavigator: () => ({}),
      getDocument: () => document,
    });
    expect(await clipboard.writeText("a")).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("treats a SecurityError as denied", async () => {
    const current = rig();
    const error = new Error("insecure");
    error.name = "SecurityError";
    current.writeText.mockRejectedValue(error);
    current.execCommand.mockReturnValue(false);
    expect(await current.clipboard.writeText("a")).toEqual({
      ok: false,
      reason: "denied",
    });
  });

  it("never throws, even when the navigator or document getter does", async () => {
    const clipboard = new BrowserClipboard({
      getNavigator: () => {
        throw new Error("blocked");
      },
    });
    expect(await clipboard.writeText("a")).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("uses the global navigator and document by default", async () => {
    const doc = document as Document & { execCommand?: unknown };
    Object.defineProperty(doc, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    try {
      expect(await new BrowserClipboard().writeText("a")).toEqual({ ok: true });
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
