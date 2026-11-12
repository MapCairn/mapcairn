// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { OpenedFile } from "@mapcairn/core";
import { runFileOpenerContract } from "@mapcairn/core/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserFileOpener } from "./BrowserFileOpener";

/** The file input the adapter has put in the page, or null. */
function fileInput(): HTMLInputElement | null {
  return document.querySelector('input[type="file"]');
}

/** Gives the input a chosen file, as the browser does, and fires `change`. */
function chooseFiles(files: readonly File[]): void {
  const input = fileInput();
  if (!input) {
    throw new Error("No picker is open.");
  }
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

function asFile({ name, text }: OpenedFile, unreadable = false): File {
  const file = new File([text], name);
  if (unreadable) {
    Object.defineProperty(file, "text", {
      value: () => Promise.reject(new Error("The file went away.")),
    });
  }
  return file;
}

/** Builds an opener over the page, with the person and the browser scripted. */
function rig() {
  let failure: "unsupported" | "unreadable" | null = null;
  const opener = new BrowserFileOpener({
    getDocument: () => (failure === "unsupported" ? undefined : document),
  });
  // happy-dom has no picker to show, so a click does nothing.
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  return {
    opener,
    controls: {
      choose: (file: OpenedFile) =>
        chooseFiles([asFile(file, failure === "unreadable")]),
      cancel: () => fileInput()?.dispatchEvent(new Event("cancel")),
      willFail: (kind: "unsupported" | "unreadable") => {
        failure = kind;
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

runFileOpenerContract("BrowserFileOpener", rig);

describe("BrowserFileOpener", () => {
  const OPTIONS = {
    accept: [".geojson", "application/geo+json"],
    maxBytes: 50,
  };

  it("clicks a hidden file input that offers the accepted types", () => {
    const { opener } = rig();
    void opener.open(OPTIONS).catch(() => {});
    const input = fileInput();
    expect(input?.hidden).toBe(true);
    expect(input?.accept).toBe(".geojson,application/geo+json");
    expect(HTMLInputElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it("removes the input once the open settles", async () => {
    const { opener, controls } = rig();
    const opened = opener.open(OPTIONS);
    controls.choose({ name: "a.geojson", text: "{}" });
    await opened;
    expect(fileInput()).toBeNull();
  });

  it("settles as cancelled when the input changes with no file", async () => {
    const { opener } = rig();
    const opened = opener.open(OPTIONS);
    chooseFiles([]);
    await expect(opened).rejects.toMatchObject({ kind: "cancelled" });
    expect(fileInput()).toBeNull();
  });

  it("settles as cancelled when the caller aborts while the file is read", async () => {
    const { opener, controls } = rig();
    const controller = new AbortController();
    const opened = opener.open({ ...OPTIONS, signal: controller.signal });
    controls.choose({ name: "a.geojson", text: "{}" });
    controller.abort();
    await expect(opened).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("is unsupported when the browser refuses the click", async () => {
    const opener = new BrowserFileOpener({ getDocument: () => document });
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {
      throw new Error("Not allowed.");
    });
    await expect(opener.open(OPTIONS)).rejects.toMatchObject({
      kind: "unsupported",
    });
    expect(fileInput()).toBeNull();
  });

  it("is unsupported without a body, and uses the page's document by default", async () => {
    const noBody = new BrowserFileOpener({
      getDocument: () => ({ body: null }) as unknown as Document,
    });
    await expect(noBody.open(OPTIONS)).rejects.toMatchObject({
      kind: "unsupported",
    });
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const opened = new BrowserFileOpener().open(OPTIONS);
    chooseFiles([new File(["{}"], "a.json")]);
    await expect(opened).resolves.toEqual({ name: "a.json", text: "{}" });
  });
});
